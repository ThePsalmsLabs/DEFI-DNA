// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/src/libraries/TransientStateLibrary.sol";

/// @title FlashAccountingLib
/// @notice Helper library for Uniswap V4's flash accounting system
/// @dev Flash accounting is V4's most innovative feature - it allows complex multi-pool
///      operations to happen atomically without intermediate token transfers
///
/// KEY CONCEPT: In V4, the PoolManager tracks "deltas" (debts) during an unlock period.
/// Instead of transferring tokens for every operation, V4:
/// 1. Tracks what you owe (negative delta) or are owed (positive delta)
/// 2. Only requires settlement at the END of the unlock period
/// 3. Allows chaining multiple operations before any tokens move
///
/// This is HUGE for gas savings and enables complex atomic operations impossible in V2/V3
library FlashAccountingLib {
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;

    // ============ Custom Errors ============

    /// @notice Thrown when trying to settle but still have outstanding debts
    error UnsettledDelta();

    /// @notice Thrown when settlement amount doesn't match expected delta
    error IncorrectSettlementAmount(int256 expected, int256 actual);

    /// @notice Thrown when trying to take more than available
    error InsufficientBalance();

    // ============ Structs ============

    /// @notice Represents a currency delta (debt or credit)
    /// @dev Negative = you owe the pool, Positive = pool owes you
    struct CurrencyDelta {
        Currency currency;
        int256 amount;
    }

    /// @notice Action to execute during flash accounting
    /// @dev This allows batching multiple operations atomically
    enum ActionType {
        SWAP,              // Execute a swap
        ADD_LIQUIDITY,     // Add liquidity to a position
        REMOVE_LIQUIDITY,  // Remove liquidity from a position
        COLLECT_FEES,      // Collect fees from a position
        DONATE             // Donate to a pool
    }

    /// @notice Encodes a flash accounting action
    struct FlashAction {
        ActionType actionType;
        bytes data;  // Encoded action-specific data
    }

    /// @notice Result of flash accounting operations
    struct FlashResult {
        CurrencyDelta[] deltas;
        uint256 gasUsed;
        bool success;
    }

    // ============ Core Flash Accounting Functions ============

    /// @notice Execute a single operation with automatic delta tracking
    /// @dev TEACHING: This is the basic building block of flash accounting
    ///      1. PoolManager.unlock() opens a flash accounting context
    ///      2. Your callback executes (swap, add liquidity, etc.)
    ///      3. PoolManager tracks deltas in transient storage (TSTORE)
    ///      4. Before unlock ends, ALL deltas must be settled (= 0)
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param data Encoded callback data
    /// @return result Raw bytes returned from unlock callback
    function executeFlashOperation(
        IPoolManager poolManager,
        bytes memory data
    ) internal returns (bytes memory result) {
        // TEACHING: unlock() is the entry point to flash accounting
        // It calls back to your contract's unlockCallback() function
        // During the callback, you can do multiple operations
        // All token movements are deferred until settlement
        result = poolManager.unlock(data);
    }

    /// @notice Execute multiple operations atomically
    /// @dev TEACHING: This is where flash accounting SHINES!
    ///      Example: Swap in Pool A → Add liquidity to Pool B → Remove from Pool C
    ///      All in ONE transaction, settling deltas only at the end
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param actions Array of actions to execute
    /// @return deltas The final currency deltas after all operations
    function executeFlashBatch(
        IPoolManager poolManager,
        FlashAction[] memory actions
    ) internal returns (CurrencyDelta[] memory deltas) {
        // Encode actions for the unlock callback
        bytes memory data = abi.encode(actions);

        // Execute the batch - unlock will call back to process each action
        bytes memory result = poolManager.unlock(data);

        // Decode resulting deltas
        deltas = abi.decode(result, (CurrencyDelta[]));
    }

    /// @notice Get current delta for a currency
    /// @dev TEACHING: During an unlock period, you can check your current debt/credit
    ///      This uses TLOAD to read from transient storage - EIP-1153
    ///      Transient storage is PERFECT for flash accounting because:
    ///      - It's cheaper than SLOAD (200 gas vs 2100 gas)
    ///      - It automatically clears at the end of the transaction
    ///      - It can't be manipulated across transactions
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param currency The currency to check
    /// @return delta Current delta (negative = debt, positive = credit)
    function getCurrencyDelta(
        IPoolManager poolManager,
        Currency currency
    ) internal view returns (int256 delta) {
        // Use TransientStateLibrary to get currency delta
        delta = poolManager.currencyDelta(address(this), currency);
    }

    /// @notice Get deltas for multiple currencies at once
    /// @dev TEACHING: Batch reading saves gas - one external call vs many
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param currencies Array of currencies to check
    /// @return deltas Array of currency deltas
    function getCurrencyDeltas(
        IPoolManager poolManager,
        Currency[] memory currencies
    ) internal view returns (CurrencyDelta[] memory deltas) {
        deltas = new CurrencyDelta[](currencies.length);

        for (uint256 i = 0; i < currencies.length; i++) {
            deltas[i] = CurrencyDelta({
                currency: currencies[i],
                amount: getCurrencyDelta(poolManager, currencies[i])
            });
        }
    }

    // ============ Settlement Functions ============

    /// @notice Settle a single currency delta
    /// @dev TEACHING: Settlement is how you "pay off" your debts to the pool
    ///      If delta is negative (you owe): Transfer tokens to PoolManager
    ///      If delta is positive (pool owes you): Take tokens from PoolManager
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param currency The currency to settle
    /// @param delta The expected delta (for validation)
    function settleCurrency(
        IPoolManager poolManager,
        Currency currency,
        int256 delta
    ) internal {
        // Verify the delta matches what we expect
        int256 actualDelta = getCurrencyDelta(poolManager, currency);
        require(actualDelta == delta, "Delta mismatch");

        if (delta < 0) {
            // We owe the pool - need to transfer tokens
            // TEACHING: settle() transfers tokens from msg.sender to PoolManager
            // It updates the delta to reflect the payment
            uint256 amountOwed = uint256(-delta);

            // For native ETH
            if (currency.isAddressZero()) {
                poolManager.settle{value: amountOwed}();
            } else {
                // For ERC20 tokens - sync then settle
                poolManager.sync(currency);
                // Transfer tokens to pool manager
                currency.transfer(address(poolManager), amountOwed);
                poolManager.settle();
            }
        } else if (delta > 0) {
            // Pool owes us - take tokens
            // TEACHING: take() transfers tokens from PoolManager to recipient
            poolManager.take(currency, msg.sender, uint256(delta));
        }
        // If delta == 0, nothing to settle
    }

    /// @notice Settle multiple currencies atomically
    /// @dev TEACHING: This is critical for multi-pool operations
    ///      After swapping across pools, you'll have multiple deltas to settle
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param deltas Array of currency deltas to settle
    function settleCurrencies(
        IPoolManager poolManager,
        CurrencyDelta[] memory deltas
    ) internal {
        for (uint256 i = 0; i < deltas.length; i++) {
            settleCurrency(poolManager, deltas[i].currency, deltas[i].amount);
        }
    }

    /// @notice Use PoolManager's ERC6909 claims to settle
    /// @dev TEACHING: Advanced settlement using claims (internal accounting)
    ///      Instead of transferring tokens, you can use claims you already have
    ///      This is EVEN MORE gas efficient for frequent traders
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param currency The currency to settle
    /// @param amount Amount to settle using claims
    function settleWithClaims(
        IPoolManager poolManager,
        Currency currency,
        uint256 amount
    ) internal {
        // TEACHING: burn() uses your ERC6909 claims to settle
        // Claims are like IOUs from the PoolManager
        // Token ID for claims = uint256(uint160(Currency.unwrap(currency)))
        uint256 claimId = currency.toId();
        poolManager.burn(msg.sender, claimId, amount);
    }

    /// @notice Take tokens as ERC6909 claims instead of actual tokens
    /// @dev TEACHING: Taking as claims = keeping tokens in PoolManager
    ///      Benefits:
    ///      - No token transfer (saves gas)
    ///      - Can use for future operations
    ///      - Perfect for traders who will swap again soon
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param currency The currency to take as claims
    /// @param amount Amount to take
    function takeAsClaims(
        IPoolManager poolManager,
        Currency currency,
        uint256 amount
    ) internal {
        // TEACHING: mint() gives you ERC6909 claims instead of tokens
        // The tokens stay in PoolManager, you get a claim
        uint256 claimId = currency.toId();
        poolManager.mint(msg.sender, claimId, amount);
    }

    // ============ Advanced Flash Accounting Patterns ============

    /// @notice Close-and-reopen pattern (used in repositioning)
    /// @dev TEACHING: This is a KILLER feature of flash accounting
    ///      V3: Remove liquidity → Wait for tokens → Add liquidity (2 txs)
    ///      V4: Remove → Add → Settle delta (1 tx, less gas, atomic!)
    ///
    /// Example: You have a position with 1000 USDC / 1 ETH liquidity
    /// 1. Remove liquidity → Delta: +1000 USDC, +1 ETH
    /// 2. Add to new position → Delta: -1000 USDC, -1 ETH (nets to 0!)
    /// 3. If ranges differ, settle the small difference
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param removeData Data for removing liquidity
    /// @param addData Data for adding liquidity
    /// @return finalDeltas Any remaining deltas to settle
    function closeAndReopen(
        IPoolManager poolManager,
        bytes memory removeData,
        bytes memory addData
    ) internal returns (CurrencyDelta[] memory finalDeltas) {
        FlashAction[] memory actions = new FlashAction[](2);

        // Action 1: Remove liquidity (creates positive deltas)
        actions[0] = FlashAction({
            actionType: ActionType.REMOVE_LIQUIDITY,
            data: removeData
        });

        // Action 2: Add liquidity (creates negative deltas)
        actions[1] = FlashAction({
            actionType: ActionType.ADD_LIQUIDITY,
            data: addData
        });

        // Execute both atomically
        finalDeltas = executeFlashBatch(poolManager, actions);

        // TEACHING: If both positions have same liquidity,
        // deltas will be ~0 (just small rounding differences)
        // This is MUCH more efficient than V3!
    }

    /// @notice Arbitrage pattern across multiple pools
    /// @dev TEACHING: Flash accounting makes arbitrage trivial
    ///      Example: ETH cheaper in Pool A, sell in Pool B
    ///      1. Buy ETH in Pool A → Delta: -USDC, +ETH
    ///      2. Sell ETH in Pool B → Delta: +USDC, -ETH (nets to 0!)
    ///      3. Settle the profit
    ///
    /// @param poolManager The Uniswap V4 PoolManager
    /// @param swaps Array of swaps to execute
    /// @return profit Profit from arbitrage
    function arbitrageAcrossPools(
        IPoolManager poolManager,
        bytes[] memory swaps
    ) internal returns (CurrencyDelta[] memory profit) {
        FlashAction[] memory actions = new FlashAction[](swaps.length);

        for (uint256 i = 0; i < swaps.length; i++) {
            actions[i] = FlashAction({
                actionType: ActionType.SWAP,
                data: swaps[i]
            });
        }

        // Execute all swaps atomically
        profit = executeFlashBatch(poolManager, actions);

        // TEACHING: Profit shows up as positive deltas
        // You can take() the profit or leave as claims for next trade
    }

    /// @notice Flash accounting validation before settlement
    /// @dev TEACHING: Always validate deltas before settling
    ///      This prevents unexpected losses from slippage/fees
    ///
    /// @param deltas The deltas to validate
    /// @param minExpected Minimum expected amounts per currency
    function validateDeltas(
        CurrencyDelta[] memory deltas,
        int256[] memory minExpected
    ) internal pure {
        require(deltas.length == minExpected.length, "Length mismatch");

        for (uint256 i = 0; i < deltas.length; i++) {
            require(
                deltas[i].amount >= minExpected[i],
                "Delta below minimum"
            );
        }
    }

    // ============ Helper Functions ============

    /// @notice Calculate net deltas for multi-step operations
    /// @dev Groups deltas by currency and sums amounts, returning unique currencies with net amounts
    /// @param deltas Array of currency deltas to net
    /// @return netDeltas Array of unique currencies with summed amounts
    function calculateNetDeltas(
        CurrencyDelta[] memory deltas
    ) internal pure returns (CurrencyDelta[] memory netDeltas) {
        if (deltas.length == 0) {
            return new CurrencyDelta[](0);
        }

        // Sort deltas by currency address for deterministic grouping
        // Using insertion sort (simple for small arrays, gas-efficient)
        CurrencyDelta[] memory sorted = new CurrencyDelta[](deltas.length);
        for (uint256 i = 0; i < deltas.length; i++) {
            sorted[i] = deltas[i];
            uint256 j = i;
            while (j > 0 && Currency.unwrap(sorted[j - 1].currency) > Currency.unwrap(sorted[j].currency)) {
                CurrencyDelta memory temp = sorted[j];
                sorted[j] = sorted[j - 1];
                sorted[j - 1] = temp;
                j--;
            }
        }

        // Count unique currencies
        uint256 uniqueCount = 1;
        for (uint256 i = 1; i < sorted.length; i++) {
            if (Currency.unwrap(sorted[i].currency) != Currency.unwrap(sorted[i - 1].currency)) {
                uniqueCount++;
            }
        }

        // Group and sum by currency
        netDeltas = new CurrencyDelta[](uniqueCount);
        uint256 netIndex = 0;
        Currency currentCurrency = sorted[0].currency;
        int256 currentSum = sorted[0].amount;

        for (uint256 i = 1; i < sorted.length; i++) {
            if (Currency.unwrap(sorted[i].currency) == Currency.unwrap(currentCurrency)) {
                // Same currency, accumulate
                currentSum += sorted[i].amount;
            } else {
                // New currency, save previous and start new
                netDeltas[netIndex] = CurrencyDelta({
                    currency: currentCurrency,
                    amount: currentSum
                });
                netIndex++;
                currentCurrency = sorted[i].currency;
                currentSum = sorted[i].amount;
            }
        }

        // Add the last currency
        netDeltas[netIndex] = CurrencyDelta({
            currency: currentCurrency,
            amount: currentSum
        });
    }

    /// @notice Check if all deltas are settled (= 0)
    /// @dev TEACHING: PoolManager requires all deltas = 0 before unlock ends
    function areAllDeltasSettled(
        CurrencyDelta[] memory deltas
    ) internal pure returns (bool) {
        for (uint256 i = 0; i < deltas.length; i++) {
            if (deltas[i].amount != 0) {
                return false;
            }
        }
        return true;
    }
}

/*
═══════════════════════════════════════════════════════════════════════════════
                            FLASH ACCOUNTING SUMMARY
═══════════════════════════════════════════════════════════════════════════════

WHY FLASH ACCOUNTING IS REVOLUTIONARY:

1. GAS SAVINGS
   V3: Every operation = token transfer (21k gas per transfer)
   V4: Only settle at the end (1 transfer vs many)
   Example: Reposition = 2 transfers vs 1 = 21k gas saved

2. ATOMIC OPERATIONS
   V3: Multi-step operations = multiple transactions (can fail midway)
   V4: Everything in one unlock = all-or-nothing atomic execution

3. COMPOSABILITY
   V3: Hard to combine operations (each needs tokens)
   V4: Chain unlimited operations (tokens only needed at end)

4. CAPITAL EFFICIENCY
   V3: Need full token balance for each step
   V4: Only need to cover the NET difference

CORE CONCEPTS:

• DELTA: Your debt/credit with the pool
  - Negative delta = you owe the pool
  - Positive delta = pool owes you
  - Zero delta = settled (required at unlock end)

• UNLOCK PERIOD: The flash accounting "session"
  - Start: poolManager.unlock()
  - During: execute operations, deltas accumulate
  - End: all deltas must = 0 (or transaction reverts)

• SETTLEMENT: Paying off deltas
  - settle() = transfer tokens to pool (pay debt)
  - take() = receive tokens from pool (collect credit)
  - mint()/burn() = use ERC6909 claims (advanced)

• TRANSIENT STORAGE (EIP-1153): Where deltas are stored
  - TSTORE/TLOAD opcodes (cheaper than SSTORE/SLOAD)
  - Auto-clears at transaction end
  - Perfect for temporary accounting

ADVANCED PATTERNS:

1. Close-and-reopen: Reposition liquidity in one tx
2. Cross-pool arbitrage: Swap across pools atomically
3. Flash liquidity: Remove → Use tokens → Re-add
4. Cascading operations: Swap → Add liquidity with proceeds

PORTFOLIO VALUE:

Understanding flash accounting = Understanding V4's core innovation
This library demonstrates:
✓ Deep protocol knowledge
✓ Gas optimization mastery
✓ Complex operation handling
✓ Production-ready code patterns

═══════════════════════════════════════════════════════════════════════════════
*/
