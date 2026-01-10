// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LOGEToken
 * @notice Governance token for the Logging Operations Global Enterprise, Limited Liability Decentralized Autonomous Organization
 * @dev ERC20 token with permit, votes, and ownership. Includes a hard cap of 100 billion tokens.
 *      Initial mint: 30 billion to deployer.
 *      Future minting: Governance-controlled via mint() function (after ownership transfer to Timelock).
 */
contract LOGEToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    /// @notice Maximum total supply that can ever be minted (100 billion tokens)
    uint256 public constant MAX_SUPPLY = 100_000_000_000 * 10**18;

    /// @notice Emitted when tokens are minted
    event Minted(address indexed to, uint256 amount);

    /// @notice Emitted when a mint attempt exceeds the max supply
    event MintRejected(uint256 attemptedAmount, uint256 currentSupply);

    /**
     * @dev Constructor: Sets name, symbol, permit, and ownership.
     *      Mints initial 30 billion tokens to the deployer (msg.sender).
     */
    constructor() 
        ERC20("Governance token for the Logging Operations Global Enterprise, Limited Liability Decentralized Autonomous Organization", "LOGE-DAO") 
        ERC20Permit("Governance token for the Logging Operations Global Enterprise, Limited Liability Decentralized Autonomous Organization") 
        Ownable(msg.sender) 
    {
        uint256 initialMint = 30_000_000_000 * 10**18;
        _mint(msg.sender, initialMint);
        emit Minted(msg.sender, initialMint);
    }

    /**
     * @notice Governance-controlled mint function (only callable by owner, typically the Timelock after transfer).
     * @dev Enforces the MAX_SUPPLY cap.
     * @param to The address receiving the minted tokens
     * @param amount The amount of tokens to mint (in wei)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        uint256 newTotal = totalSupply() + amount;
        if (newTotal > MAX_SUPPLY) {
            emit MintRejected(amount, totalSupply());
            revert("Exceeds max supply");
        }
        _mint(to, amount);
        emit Minted(to, amount);
    }

    // === Required overrides for ERC20Votes and ERC20Permit compatibility ===
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}