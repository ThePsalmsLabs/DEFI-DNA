// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console} from "forge-std/Test.sol";
import {DNASubscriber} from "../src/DNASubscriber.sol";
import {DNAReader} from "../src/DNAReader.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {
    PositionInfo,
    PositionInfoLibrary
} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @title MockPositionManager
/// @notice Mock contract for testing DNASubscriber
contract MockPositionManager {
    using PoolIdLibrary for PoolKey;
    using PositionInfoLibrary for PositionInfo;

    struct Position {
        address owner;
        PoolKey poolKey;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    mapping(uint256 => Position) public positions;
    uint256 public nextTokenId = 1;
    address public subscriber;

    function setSubscriber(address _subscriber) external {
        subscriber = _subscriber;
    }

    function mint(
        address owner,
        PoolKey memory poolKey,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        positions[tokenId] = Position({
            owner: owner,
            poolKey: poolKey,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity
        });
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return positions[tokenId].owner;
    }

    function getPositionLiquidity(uint256 tokenId) external view returns (uint128) {
        return positions[tokenId].liquidity;
    }

    function getPoolAndPositionInfo(uint256 tokenId)
        external
        view
        returns (PoolKey memory poolKey, PositionInfo info)
    {
        Position memory pos = positions[tokenId];
        poolKey = pos.poolKey;
        // Create PositionInfo with tick range
        info = PositionInfoLibrary.initialize(poolKey, pos.tickLower, pos.tickUpper);
    }

    function subscribe(uint256 tokenId) external {
        require(subscriber != address(0), "No subscriber set");
        DNASubscriber(subscriber).notifySubscribe(tokenId, "");
    }

    function unsubscribe(uint256 tokenId) external {
        require(subscriber != address(0), "No subscriber set");
        DNASubscriber(subscriber).notifyUnsubscribe(tokenId);
    }

    function modifyLiquidity(
        uint256 tokenId,
        int256 liquidityChange,
        int128 feesAccrued0,
        int128 feesAccrued1
    ) external {
        require(subscriber != address(0), "No subscriber set");

        if (liquidityChange > 0) {
            positions[tokenId].liquidity += uint128(uint256(liquidityChange));
        } else if (liquidityChange < 0) {
            positions[tokenId].liquidity -= uint128(uint256(-liquidityChange));
        }

        BalanceDelta feesAccrued = toBalanceDelta(feesAccrued0, feesAccrued1);
        DNASubscriber(subscriber).notifyModifyLiquidity(tokenId, liquidityChange, feesAccrued);
    }

    function burn(uint256 tokenId) external {
        require(subscriber != address(0), "No subscriber set");
        Position memory pos = positions[tokenId];

        PositionInfo info =
            PositionInfoLibrary.initialize(pos.poolKey, pos.tickLower, pos.tickUpper);
        BalanceDelta feesAccrued = toBalanceDelta(0, 0);

        DNASubscriber(subscriber).notifyBurn(tokenId, pos.owner, info, pos.liquidity, feesAccrued);

        delete positions[tokenId];
    }
}

/// @title MockStateView
/// @notice Mock contract for reading pool state
contract MockStateView {
    function getSlot0(PoolId)
        external
        pure
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
    {
        sqrtPriceX96 = 79_228_162_514_264_337_593_543_950_336; // ~1.0
        tick = 0;
        protocolFee = 0;
        lpFee = 3000;
    }

    function getLiquidity(PoolId) external pure returns (uint128) {
        return 1_000_000e18;
    }

    function getFeeGrowthGlobals(PoolId)
        external
        pure
        returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)
    {
        feeGrowthGlobal0 = 0;
        feeGrowthGlobal1 = 0;
    }
}

/// @title DNASubscriberTest
/// @notice Test suite for DNASubscriber contract
contract DNASubscriberTest is Test {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    DNASubscriber public dnaSubscriber;
    DNAReader public dnaReader;
    MockPositionManager public posm;
    MockStateView public stateView;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    PoolKey public testPoolKey;
    PoolKey public testPoolKey2;

    event UserAction(
        address indexed user,
        PoolId indexed poolId,
        uint256 indexed tokenId,
        DNASubscriber.ActionType actionType,
        uint128 liquidity,
        int128 feesAccrued0,
        int128 feesAccrued1,
        uint256 timestamp
    );

    event UserMilestone(
        address indexed user,
        DNASubscriber.MilestoneType milestoneType,
        uint256 value,
        uint256 timestamp
    );

    function setUp() public {
        // Deploy mock contracts
        posm = new MockPositionManager();
        stateView = new MockStateView();

        // Deploy DNA contracts with mock addresses
        dnaSubscriber = new DNASubscriber(address(posm), address(stateView));
        dnaReader = new DNAReader(address(0), address(stateView), address(posm));

        // Set subscriber in mock
        posm.setSubscriber(address(dnaSubscriber));

        // Create test pool keys
        testPoolKey = PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        testPoolKey2 = PoolKey({
            currency0: Currency.wrap(address(0x3)),
            currency1: Currency.wrap(address(0x4)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(0))
        });
    }

    // ============ Subscribe Tests ============

    function test_Subscribe_FirstPosition() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 1000e18);

        vm.expectEmit(true, true, true, false);
        emit UserMilestone(alice, DNASubscriber.MilestoneType.FIRST_POSITION, 1, block.timestamp);

        vm.prank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");

        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertEq(stats.totalPositions, 1);
        assertEq(stats.activePositions, 1);
        assertEq(stats.uniquePools, 1);
        assertEq(stats.totalLiquidityProvided, 1000e18);

        DNASubscriber.PositionData memory pos = dnaSubscriber.getPosition(tokenId);
        assertEq(pos.owner, alice);
        assertEq(pos.liquidity, 1000e18);
        assertTrue(pos.isActive);
    }

    function test_Subscribe_MultiplePositions() public {
        // Create multiple positions
        uint256 tokenId1 = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);
        uint256 tokenId2 = posm.mint(alice, testPoolKey2, -887_220, 887_220, 200e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId1, "");
        dnaSubscriber.notifySubscribe(tokenId2, "");
        vm.stopPrank();

        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertEq(stats.totalPositions, 2);
        assertEq(stats.activePositions, 2);
        assertEq(stats.uniquePools, 2);
        assertEq(stats.totalLiquidityProvided, 300e18);
    }

    function test_Subscribe_SamePool() public {
        // Two positions in same pool
        uint256 tokenId1 = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);
        uint256 tokenId2 = posm.mint(alice, testPoolKey, -887_220, 887_220, 200e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId1, "");
        dnaSubscriber.notifySubscribe(tokenId2, "");
        vm.stopPrank();

        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertEq(stats.totalPositions, 2);
        assertEq(stats.uniquePools, 1); // Same pool, should be 1
    }

    // ============ Unsubscribe Tests ============

    function test_Unsubscribe() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 1000e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");
        dnaSubscriber.notifyUnsubscribe(tokenId);
        vm.stopPrank();

        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertEq(stats.totalPositions, 1);
        assertEq(stats.activePositions, 0);

        DNASubscriber.PositionData memory pos = dnaSubscriber.getPosition(tokenId);
        assertFalse(pos.isActive);
    }

    // ============ Modify Liquidity Tests ============

    function test_ModifyLiquidity_Increase() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 1000e18);

        vm.prank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");

        BalanceDelta feesAccrued = toBalanceDelta(int128(int256(10e18)), int128(int256(5e18)));
        vm.prank(address(posm));
        dnaSubscriber.notifyModifyLiquidity(tokenId, int256(500e18), feesAccrued);

        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertEq(stats.totalLiquidityProvided, 1500e18);
        assertEq(stats.totalFeesEarned, 15e18); // 10 + 5

        DNASubscriber.PositionData memory pos = dnaSubscriber.getPosition(tokenId);
        assertEq(pos.liquidity, 1500e18);
    }

    function test_ModifyLiquidity_Decrease() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 1000e18);

        vm.prank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");

        BalanceDelta feesAccrued = toBalanceDelta(0, 0);
        vm.prank(address(posm));
        dnaSubscriber.notifyModifyLiquidity(tokenId, -int256(300e18), feesAccrued);

        DNASubscriber.PositionData memory pos = dnaSubscriber.getPosition(tokenId);
        assertEq(pos.liquidity, 700e18);
    }

    // ============ Burn Tests ============

    function test_Burn() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 1000e18);

        vm.prank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");

        PositionInfo info = PositionInfoLibrary.initialize(testPoolKey, -887_220, 887_220);
        BalanceDelta feesAccrued = toBalanceDelta(int128(int256(50e18)), int128(int256(25e18)));

        vm.prank(address(posm));
        dnaSubscriber.notifyBurn(tokenId, alice, info, 1000e18, feesAccrued);

        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertEq(stats.activePositions, 0);
        assertEq(stats.totalFeesEarned, 75e18); // 50 + 25

        DNASubscriber.PositionData memory pos = dnaSubscriber.getPosition(tokenId);
        assertFalse(pos.isActive);
        assertEq(pos.liquidity, 0);
    }

    // ============ Milestone Tests ============

    function test_PositionMilestones() public {
        // Create 12 positions to trigger milestones (10+ positions, 5+ pools)
        for (uint256 i = 0; i < 12; i++) {
            // Ensure currency0 < currency1 for valid pool keys
            address token0 = address(uint160(0x1000 + i * 2));
            address token1 = address(uint160(0x1001 + i * 2));

            PoolKey memory key = PoolKey({
                currency0: Currency.wrap(token0),
                currency1: Currency.wrap(token1),
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(0))
            });

            uint256 tokenId = posm.mint(alice, key, -887_220, 887_220, 100e18);
            vm.prank(address(posm));
            dnaSubscriber.notifySubscribe(tokenId, "");
        }

        // Check user stats
        DNASubscriber.UserStats memory stats = dnaSubscriber.getUserStats(alice);
        assertGe(stats.totalPositions, 10, "Should have at least 10 positions");
        assertGe(stats.uniquePools, 5, "Should have at least 5 unique pools");

        // Check milestones
        DNASubscriber.MilestoneStatus memory milestones = dnaSubscriber.getUserMilestones(alice);
        assertTrue(milestones.firstPosition, "firstPosition should be true");
        assertTrue(milestones.firstV4Position, "firstV4Position should be true");
        assertTrue(milestones.positions10, "positions10 should be true");
        assertTrue(milestones.pools5, "pools5 should be true");
    }

    function test_VolumeMilestones() public {
        PoolId poolId = testPoolKey.toId();

        // Record swaps to hit volume milestones
        dnaSubscriber.recordSwap(alice, poolId, 1000e18); // $1K

        DNASubscriber.MilestoneStatus memory milestones = dnaSubscriber.getUserMilestones(alice);
        assertTrue(milestones.volume1K);

        dnaSubscriber.recordSwap(alice, poolId, 9000e18); // Total $10K

        milestones = dnaSubscriber.getUserMilestones(alice);
        assertTrue(milestones.volume10K);
    }

    // ============ DNA Score Tests ============

    function test_DNAScore_NewUser() public view {
        uint256 score = dnaSubscriber.calculateDNAScore(alice);
        assertEq(score, 0);
    }

    function test_DNAScore_WithActivity() public {
        // Create positions
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 10_000e18);
        vm.prank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");

        // Add fees
        BalanceDelta feesAccrued = toBalanceDelta(int128(int256(500e18)), 0);
        vm.prank(address(posm));
        dnaSubscriber.notifyModifyLiquidity(tokenId, 0, feesAccrued);

        // Record swaps
        PoolId poolId = testPoolKey.toId();
        for (uint256 i = 0; i < 50; i++) {
            dnaSubscriber.recordSwap(alice, poolId, 1000e18);
        }

        uint256 score = dnaSubscriber.calculateDNAScore(alice);
        console.log("DNA Score:", score);

        assertGt(score, 0);
    }

    function test_GetUserTier() public {
        // Create significant activity
        for (uint256 i = 0; i < 20; i++) {
            PoolKey memory key = PoolKey({
                currency0: Currency.wrap(address(uint160(i * 2 + 1))),
                currency1: Currency.wrap(address(uint160(i * 2 + 2))),
                fee: 3000,
                tickSpacing: 60,
                hooks: IHooks(address(0))
            });

            uint256 tokenId = posm.mint(alice, key, -887_220, 887_220, 10_000e18);
            vm.prank(address(posm));
            dnaSubscriber.notifySubscribe(tokenId, "");
        }

        // Add volume
        PoolId poolId = testPoolKey.toId();
        for (uint256 i = 0; i < 100; i++) {
            dnaSubscriber.recordSwap(alice, poolId, 10_000e18);
        }

        string memory tier = dnaSubscriber.getUserTier(alice);
        console.log("User Tier:", tier);
    }

    // ============ View Function Tests ============

    function test_GetActivePositions() public {
        uint256 tokenId1 = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);
        uint256 tokenId2 = posm.mint(alice, testPoolKey, -887_220, 887_220, 200e18);
        uint256 tokenId3 = posm.mint(alice, testPoolKey, -887_220, 887_220, 300e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId1, "");
        dnaSubscriber.notifySubscribe(tokenId2, "");
        dnaSubscriber.notifySubscribe(tokenId3, "");
        dnaSubscriber.notifyUnsubscribe(tokenId2);
        vm.stopPrank();

        uint256[] memory active = dnaSubscriber.getActivePositions(alice);
        assertEq(active.length, 2);
        assertEq(active[0], tokenId1);
        assertEq(active[1], tokenId3);
    }

    function test_GetOwnerTokenIds() public {
        uint256 tokenId1 = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);
        uint256 tokenId2 = posm.mint(alice, testPoolKey, -887_220, 887_220, 200e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId1, "");
        dnaSubscriber.notifySubscribe(tokenId2, "");
        vm.stopPrank();

        uint256[] memory tokenIds = dnaSubscriber.getOwnerTokenIds(alice);
        assertEq(tokenIds.length, 2);
    }

    function test_GetUserCount() public {
        assertEq(dnaSubscriber.getUserCount(), 0);

        uint256 tokenId1 = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);
        uint256 tokenId2 = posm.mint(bob, testPoolKey, -887_220, 887_220, 200e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId1, "");
        dnaSubscriber.notifySubscribe(tokenId2, "");
        vm.stopPrank();

        assertEq(dnaSubscriber.getUserCount(), 2);
        assertEq(dnaSubscriber.getUserAtIndex(0), alice);
        assertEq(dnaSubscriber.getUserAtIndex(1), bob);
    }

    function test_HasInteractedWithPool() public {
        PoolId poolId = testPoolKey.toId();

        assertFalse(dnaSubscriber.hasInteractedWithPool(alice, poolId));

        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);
        vm.prank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");

        assertTrue(dnaSubscriber.hasInteractedWithPool(alice, poolId));
    }

    // ============ Access Control Tests ============

    function test_RevertIf_NotPositionManager() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);

        vm.prank(alice);
        vm.expectRevert("DNASubscriber: not PositionManager");
        dnaSubscriber.notifySubscribe(tokenId, "");
    }

    function test_RevertIf_UnsubscribeInactivePosition() public {
        uint256 tokenId = posm.mint(alice, testPoolKey, -887_220, 887_220, 100e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId, "");
        dnaSubscriber.notifyUnsubscribe(tokenId);

        vm.expectRevert("DNASubscriber: position not active");
        dnaSubscriber.notifyUnsubscribe(tokenId);
        vm.stopPrank();
    }

    // ============ Protocol Stats Tests ============

    function test_ProtocolStats() public {
        uint256 tokenId1 = posm.mint(alice, testPoolKey, -887_220, 887_220, 1000e18);
        uint256 tokenId2 = posm.mint(bob, testPoolKey, -887_220, 887_220, 2000e18);

        vm.startPrank(address(posm));
        dnaSubscriber.notifySubscribe(tokenId1, "");
        dnaSubscriber.notifySubscribe(tokenId2, "");

        BalanceDelta fees1 = toBalanceDelta(int128(int256(100e18)), 0);
        BalanceDelta fees2 = toBalanceDelta(int128(int256(200e18)), 0);
        dnaSubscriber.notifyModifyLiquidity(tokenId1, 0, fees1);
        dnaSubscriber.notifyModifyLiquidity(tokenId2, 0, fees2);
        vm.stopPrank();

        assertEq(dnaSubscriber.totalUsers(), 2);
        assertEq(dnaSubscriber.totalPositionsCreated(), 2);
        assertEq(dnaSubscriber.totalFeesCollected(), 300e18);
    }
}
