// scripts/deploy-with-ledger.js
const hre = require("hardhat");
const { ethers } = hre;

const Transport = require("@ledgerhq/hw-transport-node-hid-singleton").default;
const AppEth = require("@ledgerhq/hw-app-eth").default;

// Timelock roles
const PROPOSER_ROLE = ethers.utils.id("PROPOSER_ROLE");
const EXECUTOR_ROLE = ethers.utils.id("EXECUTOR_ROLE");
const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;

// --- Minimal Ledger EIP-1559 signer for ethers v5 ---
class LedgerEip1559Signer extends ethers.Signer {
  constructor(provider, { path = "m/44'/60'/0'/0/0", chainId = 137 } = {}) {
    super();
    this._provider = provider;
    this.path = path;
    this.chainId = chainId;
    this.transport = null;
    this.eth = null;
    this._address = null;
  }

  get provider() {
    return this._provider;
  }

  async _init() {
    if (this.eth) return;
    this.transport = await Transport.create();
    this.eth = new AppEth(this.transport);
  }

  async close() {
    try {
      if (this.transport) await this.transport.close();
    } catch (e) {}
    this.transport = null;
    this.eth = null;
    this._address = null;
  }

  async getAddress() {
    await this._init();
    if (this._address) return this._address;

    const res = await this.eth.getAddress(this.path, false, true);
    this._address = ethers.utils.getAddress(res.address);
    return this._address;
  }

  connect(provider) {
    return new LedgerEip1559Signer(provider, { path: this.path, chainId: this.chainId });
  }

  async signMessage(message) {
    await this._init();
    const addr = await this.getAddress();

    const bytes = typeof message === "string" ? ethers.utils.toUtf8Bytes(message) : message;
    const hex = ethers.utils.hexlify(bytes).substring(2);

    const sig = await this.eth.signPersonalMessage(this.path, hex);
    const joined = ethers.utils.joinSignature({
      r: "0x" + sig.r,
      s: "0x" + sig.s,
      v: parseInt(sig.v, 16),
    });

    const recovered = ethers.utils.verifyMessage(bytes, joined);
    if (ethers.utils.getAddress(recovered) !== addr) {
      throw new Error(`Ledger signed message mismatch: recovered ${recovered}, expected ${addr}`);
    }
    return joined;
  }

  async signTransaction(tx) {
    await this._init();

    // Resolve any Promises inside tx
    tx = await ethers.utils.resolveProperties(tx);

    // Force EIP-1559 type 2 for Polygon
    tx.type = 2;
    tx.chainId = this.chainId;

    // Fill from
    tx.from = tx.from || (await this.getAddress());

    // Fill nonce if missing
    if (tx.nonce == null) {
      tx.nonce = await this.provider.getTransactionCount(tx.from, "pending");
    }

    // Fill gasLimit if missing
    if (tx.gasLimit == null) {
      tx.gasLimit = await this.provider.estimateGas(tx);
    }

    // Fill fees if missing
    const fee = await this.provider.getFeeData();

    const maxFeePerGas =
      tx.maxFeePerGas ??
      (fee.maxFeePerGas ? fee.maxFeePerGas : await this.provider.getGasPrice());

    const maxPriorityFeePerGas =
      tx.maxPriorityFeePerGas ??
      (fee.maxPriorityFeePerGas ? fee.maxPriorityFeePerGas : null);

    // ✅ Polygon-safe fee logic:
    // - enforce a tip floor (Polygon nodes can require >= 25 gwei)
    // - buffer base fees
    const tipFloor = ethers.utils.parseUnits("30", "gwei"); // >= 25 gwei minimum
    const tipFromProvider = maxPriorityFeePerGas
      ? ethers.BigNumber.from(maxPriorityFeePerGas).mul(12).div(10) // +20%
      : tipFloor;

    tx.maxPriorityFeePerGas = tipFromProvider.lt(tipFloor) ? tipFloor : tipFromProvider;

    const maxFeeBuffered = ethers.BigNumber.from(maxFeePerGas).mul(13).div(10); // +30%
    tx.maxFeePerGas = maxFeeBuffered.lt(tx.maxPriorityFeePerGas)
      ? tx.maxPriorityFeePerGas
      : maxFeeBuffered;

    // IMPORTANT: For type 2 tx, do NOT include gasPrice
    delete tx.gasPrice;

    // Build unsigned serialized tx
    const unsignedRaw = ethers.utils.serializeTransaction(tx);
    const unsignedHex = unsignedRaw.startsWith("0x") ? unsignedRaw.substring(2) : unsignedRaw;

    // Ask Ledger to sign the raw tx
    const sig = await this.eth.signTransaction(this.path, unsignedHex);

    // For type-2 tx, ethers expects v as yParity (0 or 1)
    const v = parseInt(sig.v, 16);
    const signature = {
      r: "0x" + sig.r,
      s: "0x" + sig.s,
      v: v, // should be 0/1
    };

    return ethers.utils.serializeTransaction(tx, signature);
  }

  async sendTransaction(tx) {
    const signed = await this.signTransaction(tx);
    return this.provider.sendTransaction(signed);
  }
}

async function main() {
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  console.log("Connected network:", { name: network.name, chainId: network.chainId });

  if (network.chainId !== 137) {
    throw new Error(`Wrong chainId. Expected 137 (Polygon), got ${network.chainId}`);
  }

  const signer = new LedgerEip1559Signer(provider, {
    path: "m/44'/60'/0'/0/0",
    chainId: 137,
  });

  const deployer = await signer.getAddress();
  const startingNonce = await provider.getTransactionCount(deployer, "pending");
  console.log("Deploying from Ledger:", deployer);
  console.log("Starting nonce:", startingNonce);

  async function deploy(name, args = []) {
    const Factory = await ethers.getContractFactory(name, signer);
    console.log(`\nDeploying ${name}... (confirm on Ledger)`);
    const contract = await Factory.deploy(...args);
    await contract.deployed();
    console.log(`${name} → ${contract.address}`);
    return contract;
  }

  // 1) Deploy LOGEToken
  const token = await deploy("LOGEToken");

  // 2) Deploy TimelockController
  const minDelay = 3600; // 1 hour
  const timelock = await deploy("TimelockController", [minDelay, [], [], deployer]);

  // 3) Deploy LOGEDAO
  const governor = await deploy("LOGEDAO", [token.address, timelock.address]);

  // 4) Wire roles
  console.log("\nSetting up Timelock roles... (multiple confirmations)");
  await (await timelock.grantRole(PROPOSER_ROLE, governor.address)).wait(2);
  await (await timelock.grantRole(EXECUTOR_ROLE, ethers.constants.AddressZero)).wait(2);
  await (await timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployer)).wait(2);

  // 5) Transfer token ownership to Timelock
  await (await token.transferOwnership(timelock.address)).wait(2);

  // 6) Delegate votes (CRITICAL)
  await (await token.delegate(deployer)).wait(2);

  console.log("\n✅ DAO DEPLOYED SUCCESSFULLY!");
  console.log("Token     →", token.address);
  console.log("Timelock  →", timelock.address);
  console.log("Governor  →", governor.address);

  await signer.close();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exitCode = 1;
});
