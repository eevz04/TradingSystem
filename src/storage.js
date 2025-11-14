/**
 * Storage Manager - Unified storage abstraction layer
 * Handles all data persistence for the trading system
 * Currently uses window.storage, prepared for Google Sheets integration
 */

const StorageManager = {
    // Storage keys
    KEYS: {
        TRADES: 'trades-data',
        DAILY_PLAN_PREFIX: 'daily-plan-',
        DAILY_PLAN_CURRENT: 'daily-plan-current',
        CONFIG: 'app-config',
        ALERTS: 'alerts-state',
        OBJECTIVES: 'objectives'
    },

    /**
     * Initialize storage with default values if needed
     */
    async init() {
        try {
            // Check if trades-data exists, if not create it
            const trades = await this.getTrades();
            if (!trades) {
                await this.setTrades({
                    version: '2.0',
                    lastUpdated: new Date().toISOString(),
                    totalTrades: 0,
                    trades: []
                });
            }
            return true;
        } catch (error) {
            console.error('Storage initialization error:', error);
            return false;
        }
    },

    /**
     * Get all trades data
     */
    async getTrades() {
        try {
            let data;

            if (typeof window.storage !== 'undefined') {
                // Claude.ai environment
                const result = await window.storage.get(this.KEYS.TRADES);
                data = result?.value ? JSON.parse(result.value) : null;
            } else {
                // Local file or browser without window.storage
                const stored = localStorage.getItem(this.KEYS.TRADES);
                data = stored ? JSON.parse(stored) : null;
            }

            return data;
        } catch (error) {
            console.error('Error getting trades:', error);
            return null;
        }
    },

    /**
     * Save all trades data
     */
    async setTrades(tradesData) {
        try {
            tradesData.lastUpdated = new Date().toISOString();
            const jsonData = JSON.stringify(tradesData);

            if (typeof window.storage !== 'undefined') {
                // Claude.ai environment
                await window.storage.set(this.KEYS.TRADES, jsonData);
            } else {
                // Local file or browser without window.storage
                localStorage.setItem(this.KEYS.TRADES, jsonData);
            }

            // TODO: Sync to Google Sheets (future)
            return true;
        } catch (error) {
            console.error('Error saving trades:', error);
            return false;
        }
    },

    /**
     * Add a single trade
     */
    async addTrade(trade) {
        try {
            console.log('StorageManager.addTrade() called with:', trade);

            const data = await this.getTrades();
            console.log('Current trades data:', data);

            if (!data) {
                console.error('❌ No trades data found');
                return false;
            }

            console.log('Current trades count:', data.trades.length);

            trade.timestamp = trade.timestamp || new Date().toISOString();
            data.trades.push(trade);
            data.totalTrades = data.trades.length;

            console.log('New trades count:', data.trades.length);
            console.log('Calling setTrades()...');

            await this.setTrades(data);

            console.log('✅ Trade added successfully to storage');
            return true;
        } catch (error) {
            console.error('❌ Error adding trade:', error);
            return false;
        }
    },

    /**
     * Update an existing trade
     */
    async updateTrade(tradeId, updatedTrade) {
        try {
            const data = await this.getTrades();
            if (!data) return false;

            const index = data.trades.findIndex(t => t.orderID === tradeId);
            if (index === -1) return false;

            data.trades[index] = { ...data.trades[index], ...updatedTrade };
            await this.setTrades(data);
            return true;
        } catch (error) {
            console.error('Error updating trade:', error);
            return false;
        }
    },

    /**
     * Delete a trade
     */
    async deleteTrade(tradeId) {
        try {
            const data = await this.getTrades();
            if (!data) return false;

            data.trades = data.trades.filter(t => t.orderID !== tradeId);
            data.totalTrades = data.trades.length;

            await this.setTrades(data);
            return true;
        } catch (error) {
            console.error('Error deleting trade:', error);
            return false;
        }
    },

    /**
     * Get trades filtered by date range
     */
    async getTradesByDateRange(startDate, endDate) {
        try {
            const data = await this.getTrades();
            if (!data) return [];

            return data.trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp);
                return tradeDate >= startDate && tradeDate <= endDate;
            });
        } catch (error) {
            console.error('Error getting trades by date:', error);
            return [];
        }
    },

    /**
     * Get trades for today
     * FIX: Compares dates correctly by using local date components for comparison
     * This ensures "today" means the current calendar day in local timezone
     */
    async getTodayTrades() {
        try {
            // Get current date in local timezone
            const now = new Date();
            const localYear = now.getFullYear();
            const localMonth = now.getMonth();
            const localDate = now.getDate();

            // Create date strings for comparison (YYYY-MM-DD format)
            const todayDateStr = `${localYear}-${String(localMonth + 1).padStart(2, '0')}-${String(localDate).padStart(2, '0')}`;

            const allTrades = await this.getTrades();
            if (!allTrades || !allTrades.trades) {
                console.log('📊 getTodayTrades: No trades found in storage');
                return [];
            }

            console.log('📊 getTodayTrades Debug:', {
                todayDateStr: todayDateStr,
                totalTrades: allTrades.trades.length
            });

            const todayTrades = allTrades.trades.filter(trade => {
                // VALIDAR que timestamp existe
                if (!trade.timestamp) {
                    console.warn('⚠️ Trade sin timestamp:', {
                        orderID: trade.orderID,
                        symbol: trade.symbol
                    });
                    return false;
                }

                // VALIDAR que se puede crear Date válido
                const tradeDate = new Date(trade.timestamp);

                if (isNaN(tradeDate.getTime())) {
                    console.warn('⚠️ Trade con timestamp inválido:', {
                        orderID: trade.orderID,
                        timestamp: trade.timestamp
                    });
                    return false;
                }

                // Get trade date in local timezone for comparison
                // This ensures we compare calendar days, not UTC days
                const tradeYear = tradeDate.getFullYear();
                const tradeMonth = tradeDate.getMonth();
                const tradeDay = tradeDate.getDate();
                const tradeDateStr = `${tradeYear}-${String(tradeMonth + 1).padStart(2, '0')}-${String(tradeDay).padStart(2, '0')}`;

                // Compare date strings (calendar days)
                const isToday = tradeDateStr === todayDateStr;

                // DEBUG: Mostrar TODOS los trades con sus fechas
                console.log('Trade check:', {
                    orderID: trade.orderID,
                    symbol: trade.symbol,
                    timestamp: trade.timestamp,
                    tradeDateStr: tradeDateStr,
                    todayDateStr: todayDateStr,
                    isToday: isToday
                });

                return isToday;
            });

            console.log('✅ Trades de hoy encontrados:', todayTrades.length);
            console.log('✅ Trades de hoy:', todayTrades.map(t => ({
                symbol: t.symbol,
                pnl: t.pnl,
                timestamp: t.timestamp
            })));

            return todayTrades;

        } catch (error) {
            console.error('❌ Error en getTodayTrades:', error);
            return [];
        }
    },

    /**
     * Get daily plan by date
     */
    async getDailyPlan(date) {
        try {
            const dateKey = this.formatDateKey(date);
            const key = `${this.KEYS.DAILY_PLAN_PREFIX}${dateKey}`;
            let data;

            if (typeof window.storage !== 'undefined') {
                // Claude.ai environment
                const result = await window.storage.get(key);
                data = result?.value ? JSON.parse(result.value) : null;
            } else {
                // Local file or browser without window.storage
                const stored = localStorage.getItem(key);
                data = stored ? JSON.parse(stored) : null;
            }

            return data;
        } catch (error) {
            console.error('Error getting daily plan:', error);
            return null;
        }
    },

    /**
     * Save daily plan for a specific date
     */
    async saveDailyPlan(date, planData) {
        try {
            const dateKey = this.formatDateKey(date);
            const key = `${this.KEYS.DAILY_PLAN_PREFIX}${dateKey}`;

            planData.savedAt = new Date().toISOString();
            const jsonData = JSON.stringify(planData);

            if (typeof window.storage !== 'undefined') {
                // Claude.ai environment
                await window.storage.set(key, jsonData);

                // Update current pointer if saving today's plan
                const today = new Date();
                if (this.isSameDay(date, today)) {
                    await window.storage.set(this.KEYS.DAILY_PLAN_CURRENT, dateKey);
                }
            } else {
                // Local file or browser without window.storage
                localStorage.setItem(key, jsonData);

                // Update current pointer if saving today's plan
                const today = new Date();
                if (this.isSameDay(date, today)) {
                    localStorage.setItem(this.KEYS.DAILY_PLAN_CURRENT, dateKey);
                }
            }

            return true;
        } catch (error) {
            console.error('Error saving daily plan:', error);
            return false;
        }
    },

    /**
     * Get today's daily plan
     */
    async getTodayDailyPlan() {
        return await this.getDailyPlan(new Date());
    },

    /**
     * Format date as YYYY-MM-DD
     */
    formatDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Check if two dates are the same day
     */
    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    },

    /**
     * Export all data for backup
     */
    async exportAll() {
        try {
            const trades = await this.getTrades();
            let config, alerts, objectives;

            if (typeof window.storage !== 'undefined') {
                // Claude.ai environment
                const configResult = await window.storage.get(this.KEYS.CONFIG);
                config = configResult?.value ? JSON.parse(configResult.value) : null;

                const alertsResult = await window.storage.get(this.KEYS.ALERTS);
                alerts = alertsResult?.value ? JSON.parse(alertsResult.value) : null;

                const objectivesResult = await window.storage.get(this.KEYS.OBJECTIVES);
                objectives = objectivesResult?.value ? JSON.parse(objectivesResult.value) : null;
            } else {
                // Local file or browser without window.storage
                const configStored = localStorage.getItem(this.KEYS.CONFIG);
                config = configStored ? JSON.parse(configStored) : null;

                const alertsStored = localStorage.getItem(this.KEYS.ALERTS);
                alerts = alertsStored ? JSON.parse(alertsStored) : null;

                const objectivesStored = localStorage.getItem(this.KEYS.OBJECTIVES);
                objectives = objectivesStored ? JSON.parse(objectivesStored) : null;
            }

            return {
                trades,
                config,
                alerts,
                objectives,
                exportDate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error exporting data:', error);
            return null;
        }
    },

    /**
     * Import data from backup
     */
    async importAll(data) {
        try {
            if (data.trades) await this.setTrades(data.trades);

            if (typeof window.storage !== 'undefined') {
                // Claude.ai environment
                if (data.config) await window.storage.set(this.KEYS.CONFIG, JSON.stringify(data.config));
                if (data.alerts) await window.storage.set(this.KEYS.ALERTS, JSON.stringify(data.alerts));
                if (data.objectives) await window.storage.set(this.KEYS.OBJECTIVES, JSON.stringify(data.objectives));
            } else {
                // Local file or browser without window.storage
                if (data.config) localStorage.setItem(this.KEYS.CONFIG, JSON.stringify(data.config));
                if (data.alerts) localStorage.setItem(this.KEYS.ALERTS, JSON.stringify(data.alerts));
                if (data.objectives) localStorage.setItem(this.KEYS.OBJECTIVES, JSON.stringify(data.objectives));
            }

            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
