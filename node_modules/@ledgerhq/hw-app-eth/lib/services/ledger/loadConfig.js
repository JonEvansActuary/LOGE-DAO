"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoadConfig = void 0;
const defaultLoadConfig = {
    nftExplorerBaseURL: "https://nft.api.live.ledger.com/v1/ethereum",
    pluginBaseURL: "https://cdn.live.ledger.com",
    extraPlugins: null,
    cryptoassetsBaseURL: "https://cdn.live.ledger.com/cryptoassets",
    calServiceURL: "https://crypto-assets-service.api.ledger.com",
};
function getLoadConfig(userLoadConfig) {
    return {
        ...defaultLoadConfig,
        ...userLoadConfig,
    };
}
exports.getLoadConfig = getLoadConfig;
//# sourceMappingURL=loadConfig.js.map