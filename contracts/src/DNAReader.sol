// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {
    PositionInfo,
    PositionInfoLibrary
} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

/// @notice Minimal interface for PositionManager functions we need
interface IPositionManagerMinimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function getPoolAndPositionInfo(uint256 tokenId)
        external
        view
        returns (PoolKey memory, PositionInfo);
}

/// @notice Minimal interface for StateView functions we need
interface IStateViewMinimal {
    function getSlot0(PoolId poolId) external view returns (uint160, int24, uint24, uint24);
    function getLiquidity(PoolId poolId) external view returns (uint128);
    function getFeeGrowthGlobals(PoolId poolId) external view returns (uint256, uint256);
}

/// @title DNAReader
/// @notice Batch reading of pool and position data for the DeFi DNA platform
/// @dev Provides efficient multi-call reads for frontend and indexer
contract DNAReader {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using PositionInfoLibrary for PositionInfo;

    // ============ State Variables ============

    IPoolManager public immutable poolManager;
    IStateViewMinimal public immutable stateView;
    IPositionManagerMinimal public immutable positionManager;

    // ============ Structs ============

    /// @notice Pool snapshot data
    struct PoolSnapshot {
        bytes32 poolId;
        uint160 sqrtPriceX96;
        int24 tick;
        uint24 protocolFee;
        uint24 lpFee;
        uint128 liquidity;
        uint256 feeGrowthGlobal0;
        uint256 feeGrowthGlobal1;
    }

    /// @notice Position snapshot with calculated values
    struct PositionSnapshot {
        uint256 tokenId;
        address owner;
        bytes32 poolId;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        bool isInRange;
    }

    /// @notice User summary data
    struct UserSummary {
        address user;
        uint256 totalPositions;
        uint256 activePositions;
        uint256 totalValueUsd;
        uint256 totalFeesUsd;
        uint256 uniquePools;
    }

    // ============ Constructor ============

    constructor(address _poolManager, address _stateView, address _positionManager) {
        poolManager = IPoolManager(_poolManager);
        stateView = IStateViewMinimal(_stateView);
        positionManager = IPositionManagerMinimal(_positionManager);
    }

    // ============ Pool Reading Functions ============

    /// @notice Get snapshot of a single pool
    /// @param poolId The pool ID
    /// @return snapshot The pool snapshot
    function getPoolSnapshot(PoolId poolId) external view returns (PoolSnapshot memory snapshot) {
        snapshot.poolId = PoolId.unwrap(poolId);

        (snapshot.sqrtPriceX96, snapshot.tick, snapshot.protocolFee, snapshot.lpFee) =
            stateView.getSlot0(poolId);

        snapshot.liquidity = stateView.getLiquidity(poolId);

        (snapshot.feeGrowthGlobal0, snapshot.feeGrowthGlobal1) =
            stateView.getFeeGrowthGlobals(poolId);
    }

    /// @notice Get snapshots of multiple pools
    /// @param poolIds Array of pool IDs
    /// @return snapshots Array of pool snapshots
    function getPoolSnapshots(PoolId[] calldata poolIds)
        external
        view
        returns (PoolSnapshot[] memory snapshots)
    {
        snapshots = new PoolSnapshot[](poolIds.length);

        for (uint256 i = 0; i < poolIds.length; i++) {
            snapshots[i].poolId = PoolId.unwrap(poolIds[i]);

            (
                snapshots[i].sqrtPriceX96,
                snapshots[i].tick,
                snapshots[i].protocolFee,
                snapshots[i].lpFee
            ) = stateView.getSlot0(poolIds[i]);

            snapshots[i].liquidity = stateView.getLiquidity(poolIds[i]);

            (snapshots[i].feeGrowthGlobal0, snapshots[i].feeGrowthGlobal1) =
                stateView.getFeeGrowthGlobals(poolIds[i]);
        }
    }

    /// @notice Get current tick for a pool
    /// @param poolId The pool ID
    /// @return tick The current tick
    function getCurrentTick(PoolId poolId) external view returns (int24 tick) {
        (, tick,,) = stateView.getSlot0(poolId);
    }

    /// @notice Get current ticks for multiple pools
    /// @param poolIds Array of pool IDs
    /// @return ticks Array of current ticks
    function getCurrentTicks(PoolId[] calldata poolIds)
        external
        view
        returns (int24[] memory ticks)
    {
        ticks = new int24[](poolIds.length);
        for (uint256 i = 0; i < poolIds.length; i++) {
            (, ticks[i],,) = stateView.getSlot0(poolIds[i]);
        }
    }

    // ============ Position Reading Functions ============

    /// @notice Get position snapshot with calculated fees
    /// @param tokenId The token ID
    /// @return snapshot The position snapshot
    function getPositionSnapshot(uint256 tokenId)
        external
        view
        returns (PositionSnapshot memory snapshot)
    {
        snapshot.tokenId = tokenId;

        // Get owner
        try positionManager.ownerOf(tokenId) returns (address owner) {
            snapshot.owner = owner;
        } catch {
            return snapshot;
        }

        // Get pool and position info
        (PoolKey memory key, PositionInfo info) = positionManager.getPoolAndPositionInfo(tokenId);
        snapshot.poolId = PoolId.unwrap(key.toId());

        // Get tick range from position info
        snapshot.tickLower = info.tickLower();
        snapshot.tickUpper = info.tickUpper();

        // Get liquidity
        snapshot.liquidity = positionManager.getPositionLiquidity(tokenId);

        // Get current tick to check if in range
        (, int24 currentTick,,) = stateView.getSlot0(key.toId());
        snapshot.isInRange = currentTick >= snapshot.tickLower && currentTick < snapshot.tickUpper;
    }

    /// @notice Get position snapshots for multiple token IDs
    /// @param tokenIds Array of token IDs
    /// @return snapshots Array of position snapshots
    function getPositionSnapshots(uint256[] calldata tokenIds)
        external
        view
        returns (PositionSnapshot[] memory snapshots)
    {
        snapshots = new PositionSnapshot[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            snapshots[i].tokenId = tokenIds[i];

            try positionManager.ownerOf(tokenIds[i]) returns (address owner) {
                snapshots[i].owner = owner;

                (PoolKey memory key, PositionInfo info) =
                    positionManager.getPoolAndPositionInfo(tokenIds[i]);
                snapshots[i].poolId = PoolId.unwrap(key.toId());
                snapshots[i].tickLower = info.tickLower();
                snapshots[i].tickUpper = info.tickUpper();
                snapshots[i].liquidity = positionManager.getPositionLiquidity(tokenIds[i]);

                (, int24 currentTick,,) = stateView.getSlot0(key.toId());
                snapshots[i].isInRange =
                    currentTick >= snapshots[i].tickLower && currentTick < snapshots[i].tickUpper;
            } catch {
                continue;
            }
        }
    }

    /// @notice Check if multiple positions are in range
    /// @param tokenIds Array of token IDs
    /// @return inRange Array of booleans indicating if in range
    function checkPositionsInRange(uint256[] calldata tokenIds)
        external
        view
        returns (bool[] memory inRange)
    {
        inRange = new bool[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            try positionManager.ownerOf(tokenIds[i]) returns (address) {
                (PoolKey memory key, PositionInfo info) =
                    positionManager.getPoolAndPositionInfo(tokenIds[i]);
                (, int24 currentTick,,) = stateView.getSlot0(key.toId());

                int24 tickLower = info.tickLower();
                int24 tickUpper = info.tickUpper();

                inRange[i] = currentTick >= tickLower && currentTick < tickUpper;
            } catch {
                inRange[i] = false;
            }
        }
    }

    // ============ Utility Functions ============

    /// @notice Convert sqrtPriceX96 to human-readable price
    /// @dev Uses FullMath.mulDiv to prevent overflow
    /// @param sqrtPriceX96 The sqrt price in Q96 format
    /// @param decimals0 Decimals of token0
    /// @param decimals1 Decimals of token1
    /// @return price The price (token1 per token0) scaled by 1e18
    function sqrtPriceToPrice(uint160 sqrtPriceX96, uint8 decimals0, uint8 decimals1)
        external
        pure
        returns (uint256 price)
    {
        // Price formula: (sqrtPriceX96 / 2^96)^2 * (10^decimals0 / 10^decimals1) * 1e18
        // = (sqrtPriceX96^2 * 10^decimals0 * 1e18) / (2^192 * 10^decimals1)
        // To avoid overflow, we use FullMath.mulDiv for the entire calculation

        uint256 sqrtPrice = uint256(sqrtPriceX96);
        uint256 numerator = sqrtPrice * sqrtPrice; // sqrtPriceX96^2

        // Calculate decimals multiplier
        uint256 decimalsMultiplier = 10 ** decimals0;
        uint256 decimalsDivisor = 10 ** decimals1;

        // Denominator = 2^192 * 10^decimals1
        uint256 denominator = (1 << 192) * decimalsDivisor;

        // Use FullMath to safely calculate: (numerator * 1e18 * decimalsMultiplier) / denominator
        price = FullMath.mulDiv(numerator, 1e18 * decimalsMultiplier, denominator);
    }

    /// @notice Convert tick to sqrtPriceX96
    /// @param tick The tick
    /// @return sqrtPriceX96 The sqrt price in Q96 format
    function tickToSqrtPriceX96(int24 tick) external pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(uint24(-tick)) : uint256(uint24(tick));

        uint256 ratio = absTick & 0x1 != 0
            ? 0xfffcb933bd6fad37aa2d162d1a594001
            : 0x100000000000000000000000000000000;

        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;

        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    // ============ Multicall Support ============

    /// @notice Execute multiple read calls in a single transaction
    /// @param data Array of encoded function calls
    /// @return results Array of return data
    function multicall(bytes[] calldata data) external view returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).staticcall(data[i]);
            require(success, "DNAReader: multicall failed");
            results[i] = result;
        }
    }
}
