// Official Uniswap/contracts deployments/{8453,4663}.md, checked 2026-09-11.
// Chain IDs, not router labels, select the trusted factory/manager registry.
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export interface DexDeployment { v2Factory: string; v3Factory: string; v4Manager: string; v4PositionManager: string; weth: string }
export const DEX_DEPLOYMENTS: Record<number, DexDeployment> = {
  8453: { v2Factory: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6', v3Factory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
    v4Manager: '0x498581ff718922c3f8e6a244956af099b2652b2b', v4PositionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc', weth: '0x4200000000000000000000000000000000000006' },
  4663: { v2Factory: '0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f', v3Factory: '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
    v4Manager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', v4PositionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7', weth: '0x0bd7d308f8e1639fab988df18a8011f41eacad73' },
};
export interface QuoteAsset { symbol: string; decimals: number; priceKey: string }
export function quoteAssets(chainId: number): Record<string, QuoteAsset> {
  if (chainId === 8453) return {
    [DEX_DEPLOYMENTS[8453].weth]: { symbol: 'WETH', decimals: 18, priceKey: 'base:0x4200000000000000000000000000000000000006' },
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6, priceKey: 'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  };
  if (chainId === 4663) return {
    [DEX_DEPLOYMENTS[4663].weth]: { symbol: 'WETH', decimals: 18, priceKey: `robinhood:${DEX_DEPLOYMENTS[4663].weth}` },
    '0x5fc5360d0400a0fd4f2af552add042d716f1d168': { symbol: 'USDG', decimals: 6, priceKey: 'robinhood:0x5fc5360d0400a0fd4f2af552add042d716f1d168' },
  };
  return {};
}
