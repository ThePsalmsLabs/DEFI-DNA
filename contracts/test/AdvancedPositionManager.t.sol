// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/AdvancedPositionManager.sol";
import "../src/libraries/FlashAccountingLib.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {
    PositionInfo,
    PositionInfoLibrary
} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

/// @title MockPoolManager
/// @notice Mock contract for testing AdvancedPositionManager
contract MockPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory) {
        return data;
    }

    function exttload(bytes32) external pure returns (bytes32) {
        return bytes32(0);
    }

    function sync(Currency) external {}

    function settle() external payable returns (uint256) {
        return msg.value;
    }
    function take(Currency, address, uint256) external {}
    function mint(address, uint256, uint256) external {}
    function burn(address, uint256, uint256) external {}
}

/// @title MockPositionManagerForAPM
/// @notice Mock contract for testing AdvancedPositionManager
contract MockPositionManagerForAPM {
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
        info = PositionInfoLibrary.initialize(poolKey, pos.tickLower, pos.tickUpper);
    }

    function modifyLiquidities(bytes calldata, uint256) external payable {}
    function modifyLiquiditiesWithoutUnlock(bytes calldata, bytes[] calldata) external payable {}
}

/// @title AdvancedPositionManagerTest
/// @notice Comprehensive tests demonstrating flash accounting mastery
contract AdvancedPositionManagerTest is Test {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ============ Contracts ============
    AdvancedPositionManager public apm;
    MockPoolManager public mockPoolManager;
    MockPositionManagerForAPM public mockPositionManager;

    // ============ Test Accounts ============
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    // ============ Test Pool ============
    PoolKey public ethUsdcPool;
    PoolId public ethUsdcPoolId;

    // ============ Setup ============

    function setUp() public {
        // Deploy mock contracts
        mockPoolManager = new MockPoolManager();
        mockPositionManager = new MockPositionManagerForAPM();

        // Deploy our advanced position manager with mocks
        apm = new AdvancedPositionManager(address(mockPoolManager), address(mockPositionManager));

        // Setup test pool
        ethUsdcPool = PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        ethUsdcPoolId = ethUsdcPool.toId();

        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ============ Flash Accounting Library Tests ============

    /// @notice Test delta validation
    function test_ValidateDeltas_Success() public pure {
        FlashAccountingLib.CurrencyDelta[] memory deltas = new FlashAccountingLib.CurrencyDelta[](2);

        deltas[0] =
            FlashAccountingLib.CurrencyDelta({currency: Currency.wrap(address(0)), amount: 1000});

        deltas[1] =
            FlashAccountingLib.CurrencyDelta({currency: Currency.wrap(address(0x1)), amount: 500});

        int256[] memory minExpected = new int256[](2);
        minExpected[0] = 1000;
        minExpected[1] = 500;

        // Should not revert
        FlashAccountingLib.validateDeltas(deltas, minExpected);
    }

    /// @notice Test checking if all deltas are settled
    function test_AreAllDeltasSettled() public pure {
        FlashAccountingLib.CurrencyDelta[] memory settledDeltas =
            new FlashAccountingLib.CurrencyDelta[](2);

        settledDeltas[0] =
            FlashAccountingLib.CurrencyDelta({currency: Currency.wrap(address(0)), amount: 0});

        settledDeltas[1] =
            FlashAccountingLib.CurrencyDelta({currency: Currency.wrap(address(0x1)), amount: 0});

        assertTrue(
            FlashAccountingLib.areAllDeltasSettled(settledDeltas), "All deltas should be settled"
        );

        // Test with unsettled deltas
        FlashAccountingLib.CurrencyDelta[] memory unsettledDeltas =
            new FlashAccountingLib.CurrencyDelta[](2);

        unsettledDeltas[0] =
            FlashAccountingLib.CurrencyDelta({currency: Currency.wrap(address(0)), amount: 100});

        unsettledDeltas[1] =
            FlashAccountingLib.CurrencyDelta({currency: Currency.wrap(address(0x1)), amount: 0});

        assertFalse(
            FlashAccountingLib.areAllDeltasSettled(unsettledDeltas), "Deltas should not be settled"
        );
    }

    // ============ Advanced Position Manager Tests ============

    /// @notice Test user statistics tracking
    function test_GetUserStats() public view {
        (uint256 operations, uint256 gasUsed, uint256 avgGas) = apm.getUserStats(alice);

        assertEq(operations, 0, "No operations yet");
        assertEq(gasUsed, 0, "No gas used yet");
        assertEq(avgGas, 0, "No average gas yet");
    }

    /// @notice Test contract deployment
    function test_Deployment() public view {
        assertEq(address(apm.poolManager()), address(mockPoolManager));
        assertEq(address(apm.positionManager()), address(mockPositionManager));
        assertEq(apm.owner(), address(this));
    }

    /// @notice Test initial state
    function test_InitialState() public view {
        assertEq(apm.totalGasUsed(alice), 0);
        assertEq(apm.successfulOperations(alice), 0);
        assertEq(apm.totalGasUsed(bob), 0);
        assertEq(apm.successfulOperations(bob), 0);
    }

    // ============ Rescue Function Tests ============

    /// @notice Test rescue tokens access control
    function test_RevertWhen_RescueTokens_NotOwner() public {
        address testToken = makeAddr("token");

        vm.prank(bob);
        vm.expectRevert(AdvancedPositionManager.Unauthorized.selector);
        apm.rescueTokens(testToken, alice, 1000);
    }

    // ============ Flash Action Tests ============

    /// @notice Test flash action types
    function test_FlashActionTypes() public pure {
        FlashAccountingLib.ActionType swapType = FlashAccountingLib.ActionType.SWAP;
        FlashAccountingLib.ActionType addType = FlashAccountingLib.ActionType.ADD_LIQUIDITY;
        FlashAccountingLib.ActionType removeType = FlashAccountingLib.ActionType.REMOVE_LIQUIDITY;
        FlashAccountingLib.ActionType collectType = FlashAccountingLib.ActionType.COLLECT_FEES;
        FlashAccountingLib.ActionType donateType = FlashAccountingLib.ActionType.DONATE;

        assertTrue(uint8(swapType) == 0);
        assertTrue(uint8(addType) == 1);
        assertTrue(uint8(removeType) == 2);
        assertTrue(uint8(collectType) == 3);
        assertTrue(uint8(donateType) == 4);
    }

    /// @notice Test currency delta struct
    function test_CurrencyDeltaStruct() public pure {
        FlashAccountingLib.CurrencyDelta memory delta = FlashAccountingLib.CurrencyDelta({
            currency: Currency.wrap(address(0x1234)), amount: -1000
        });

        assertEq(Currency.unwrap(delta.currency), address(0x1234));
        assertEq(delta.amount, -1000);
    }

    // ============ Pool Key Tests ============

    /// @notice Test pool ID computation
    function test_PoolIdComputation() public view {
        PoolId poolId = ethUsdcPool.toId();

        assertTrue(PoolId.unwrap(poolId) != bytes32(0));

        PoolId poolId2 = ethUsdcPool.toId();
        assertEq(PoolId.unwrap(poolId), PoolId.unwrap(poolId2));
    }

    /// @notice Test different pools give different IDs
    function test_DifferentPoolsDifferentIds() public pure {
        PoolKey memory pool1 = PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        PoolKey memory pool2 = PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(0))
        });

        PoolId id1 = pool1.toId();
        PoolId id2 = pool2.toId();

        assertTrue(PoolId.unwrap(id1) != PoolId.unwrap(id2));
    }

    // ============ Position Tests with Mocks ============

    /// @notice Test rebalance requires position ownership
    function test_RevertWhen_RebalancePosition_NotOwner() public {
        // Create a position owned by alice
        uint256 tokenId = mockPositionManager.mint(alice, ethUsdcPool, -887_220, 887_220, 1000e18);

        // Bob tries to rebalance Alice's position
        FlashAccountingLib.CurrencyDelta[] memory emptyDeltas =
            new FlashAccountingLib.CurrencyDelta[](0);
        vm.prank(bob);
        vm.expectRevert(AdvancedPositionManager.PositionNotOwned.selector);
        apm.rebalancePosition(tokenId, -1000, 1000, emptyDeltas);
    }

    /// @notice Test rebalance requires valid tick range
    function test_RevertWhen_RebalancePosition_InvalidTicks() public {
        // Create a position owned by alice
        uint256 tokenId = mockPositionManager.mint(alice, ethUsdcPool, -887_220, 887_220, 1000e18);

        // Alice tries invalid tick range
        FlashAccountingLib.CurrencyDelta[] memory emptyDeltas =
            new FlashAccountingLib.CurrencyDelta[](0);
        vm.prank(alice);
        vm.expectRevert(AdvancedPositionManager.InvalidTickRange.selector);
        apm.rebalancePosition(tokenId, 1000, -1000, emptyDeltas);
    }

    // Note: compoundFees function removed - functionality can be added back if needed
    // Keeping test structure for potential future implementation

    /// @notice Test cross pool rebalance requires ownership
    function test_RevertWhen_RebalanceCrossPools_NotOwner() public {
        uint256 tokenId = mockPositionManager.mint(alice, ethUsdcPool, -887_220, 887_220, 1000e18);

        PoolKey memory newPool = PoolKey({
            currency0: Currency.wrap(address(0x1)),
            currency1: Currency.wrap(address(0x2)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(0))
        });

        FlashAccountingLib.CurrencyDelta[] memory emptyDeltas =
            new FlashAccountingLib.CurrencyDelta[](0);
        vm.prank(bob);
        vm.expectRevert(AdvancedPositionManager.PositionNotOwned.selector);
        apm.rebalanceCrossPools(tokenId, newPool, -1000, 1000, emptyDeltas);
    }

    /// @notice Test cross pool rebalance requires matching currencies
    function test_RevertWhen_RebalanceCrossPools_CurrencyMismatch() public {
        uint256 tokenId = mockPositionManager.mint(alice, ethUsdcPool, -887_220, 887_220, 1000e18);

        // Different currencies
        PoolKey memory newPool = PoolKey({
            currency0: Currency.wrap(address(0x3)),
            currency1: Currency.wrap(address(0x4)),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(0))
        });

        FlashAccountingLib.CurrencyDelta[] memory emptyDeltas =
            new FlashAccountingLib.CurrencyDelta[](0);
        vm.prank(alice);
        vm.expectRevert(AdvancedPositionManager.CurrencyMismatch.selector);
        apm.rebalanceCrossPools(tokenId, newPool, -1000, 1000, emptyDeltas);
    }
}
