DOCUMENTO MAESTRO DE ELABORACIÓN
Sistema Completo de Trading Analytics

🎯 ÍNDICE

Arquitectura General del Sistema
Módulo 1: Parser Dual
Módulo 2: Sistema de Almacenamiento
Módulo 3: Google Sheets Integration
Módulo 4: Dashboard HTML (5 Vistas)
Módulo 5: Sistema de Configuración
Módulo 6: Sistema de Alertas
Flujos Completos de Usuario
Tests de Consistencia
Plan de Implementación


1. ARQUITECTURA GENERAL DEL SISTEMA
1.1 Diagrama de Componentes
┌─────────────────────────────────────────────────────────────────┐
│                    FUENTES DE DATOS                             │
├─────────────────────────────────────────────────────────────────┤
│  • Plataforma Funding (datos UTC)                               │
│  • Entrada manual (formulario directo en Dashboard)             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PARSER DUAL (HTML)                            │
├─────────────────────────────────────────────────────────────────┤
│  • Detección de formato                                         │
│  • Conversión UTC → BRT                                         │
│  • Agrupación automática/manual                                 │
│  • Cálculos automáticos                                         │
│  • Generación de salidas (3 destinos)                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
           ┌────────────────┼────────────────┐
           ↓                ↓                ↓
    ┌──────────┐    ┌──────────────┐    ┌──────────────┐
    │ TELEGRAM │    │ GOOGLE SHEET │    │ HTML STORAGE │
    │ (Plantilla)│  │ (Backup CSV) │    │ (window.storage)│
    └──────────┘    └──────────────┘    └──────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                 DASHBOARD HTML (5 VISTAS)                       │
├─────────────────────────────────────────────────────────────────┤
│  Vista 1: Base de Datos (tabla completa)                       │
│  Vista 2: Análisis por Bloques                                 │
│  Vista 3: Progreso Continuo                                    │
│  Vista 4: Análisis Temporal (Semanal/Mensual)                  │
│  Vista 5: Expected Value (EV)                                  │
├─────────────────────────────────────────────────────────────────┤
│  • Configuración (objetivos, alertas, personalización)         │
│  • Sistema de Alertas Visuales                                 │
│  • Exportar/Importar CSV                                       │
└─────────────────────────────────────────────────────────────────┘
1.2 Flujo de Datos
ENTRADA → PARSER → VALIDACIÓN → STORAGE (3 destinos) → VISUALIZACIÓN → ANÁLISIS
1.3 Tecnologías

Frontend: HTML5, CSS3 (Tailwind), JavaScript (ES6+)
Almacenamiento: window.storage API (persistente)
Librerías:

Recharts (gráficos)
Date-fns (manejo de fechas)
Papa Parse (CSV)


Backend: Ninguno (todo client-side)
Integración: Google Sheets (manual via CSV)


2. MÓDULO 1: PARSER DUAL
2.1 Propósito
Convertir datos crudos de la plataforma en trades estructurados y generar 3 salidas:

Plantilla Telegram (para reflexiones)
Línea CSV (para Google Sheet)
Objeto JSON (para HTML Storage)

2.2 Estructura del Archivo
Nombre: parser.html (archivo standalone)
2.3 Interfaz de Usuario
html╔═══════════════════════════════════════════════════════════════╗
║  🚀 PARSER DUAL - Trade Entry System                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  📋 PASO 1: Pega datos de plataforma                          ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ [Textarea expandible]                                   │ ║
║  │ Acepta:                                                  │ ║
║  │ • Línea continua de Funding                             │ ║
║  │ • Múltiples líneas (detecta agrupables)                 │ ║
║  │ • Formato con SL/TP/Risk incluidos                      │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  [Detectar Trades] →                                          ║
║                                                               ║
║  ✅ X trades detectados                                       ║
║  ✅ Y grupos agrupables encontrados                           ║
╚═══════════════════════════════════════════════════════════════╝
2.4 Funcionalidades Detalladas
2.4.1 Detección de Formato
javascriptfunction detectFormat(input) {
  const formats = {
    funding: /^\d{8,}\d{4}-\d{2}-\d{2}/,  // Order ID + fecha
    withMetadata: /SL\s*[:=]?\s*[\d.]+/i,  // Incluye SL
    multiple: /\n/g                         // Múltiples líneas
  };
  
  return {
    type: identifyType(input),
    hasMetadata: formats.withMetadata.test(input),
    isMultiple: (input.match(formats.multiple) || []).length > 0,
    lineCount: input.split('\n').filter(Boolean).length
  };
}
2.4.2 Extracción de Datos
javascriptfunction extractTradeData(line) {
  // Formato esperado de Funding:
  // OrderID + OpenTime(UTC) + OpenPrice + CloseTime(UTC) + ClosePrice + Side + Symbol + Volume + P&L
  
  const regex = /^(\d+)(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\$?([\d,]+\.?\d*)/;
  
  const extracted = {
    orderID: match[1],
    openTimeUTC: match[2],
    openPrice: parseFloat(match[3].replace(',', '')),
    closeTimeUTC: match[4],
    closePrice: parseFloat(match[5]),
    side: match[6],  // SELL/BUY
    symbol: match[7],
    volume: parseFloat(match[8]),
    pnl: parseFloat(match[9])
  };
  
  // Conversión UTC → BRT
  extracted.openTimeBRT = convertToBRT(extracted.openTimeUTC);
  extracted.closeTimeBRT = convertToBRT(extracted.closeTimeUTC);
  
  // Extracción de metadata adicional si existe
  const metadata = extractMetadata(line);
  if (metadata.sl) extracted.stopLoss = metadata.sl;
  if (metadata.tp) extracted.takeProfit = metadata.tp;
  if (metadata.risk) extracted.riskPlanned = metadata.risk;
  
  return extracted;
}
2.4.3 Detección de Agrupables
javascriptfunction detectGroupableTrades(trades) {
  const groups = {};
  
  trades.forEach(trade => {
    const key = `${trade.symbol}_${trade.side}_${trade.openDate}`;
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(trade);
  });
  
  const groupable = Object.values(groups).filter(g => g.length >= 2);
  const individual = Object.values(groups).filter(g => g.length === 1).flat();
  
  return { groupable, individual };
}
2.4.4 Interfaz de Agrupación
html╔═══════════════════════════════════════════════════════════════╗
║  📦 AGRUPACIÓN DETECTADA                                      ║
╠═══════════════════════════════════════════════════════════════╣
║  ✅ Grupo 1: SOLUSD SELL - 29/10/2025 (2 órdenes)            ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ [✓] 323896706 - Entry $197.74 - Size 6 - P&L $9.48     │ ║
║  │ [✓] 323881865 - Entry $198.18 - Size 6 - P&L $12.48    │ ║
║  │                                                          │ ║
║  │ 📊 Si agrupas:                                           │ ║
║  │ • Entry promedio: $197.96                                │ ║
║  │ • P&L total: $21.96                                      │ ║
║  │ • Size total: 12                                         │ ║
║  │                                                          │ ║
║  │ [✅ Agrupar] [✂️ Separar]                                │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  [Continuar →]                                                ║
╚═══════════════════════════════════════════════════════════════╝
2.4.5 Completar Datos Faltantes
html╔═══════════════════════════════════════════════════════════════╗
║  📝 COMPLETAR DATOS - Trade #1                                ║
╠═══════════════════════════════════════════════════════════════╣
║  Symbol: SOLUSD SHORT                                         ║
║  Entry: $197.96 (promedio) | Exit: $196.13                   ║
║  P&L: +$21.96                                                 ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ Trade Number:                                            │ ║
║  │ ● Auto (siguiente): [6] ← Detectado                     │ ║
║  │ ○ Manual: [___]                                          │ ║
║  │                                                          │ ║
║  │ Stop Loss: [$202.00____]                                │ ║
║  │ Take Profit: [$190.00____]                              │ ║
║  │ Riesgo Planeado: [$100____]                             │ ║
║  │                                                          │ ║
║  │ ℹ️ Riesgo calculado: $86 (automático de posiciones)     │ ║
║  │                                                          │ ║
║  │ Ítem (opcional): [Setup limpio________]                 │ ║
║  │ Observación (opcional): [_________________]             │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║                                                               ║
║  [⚡ Generar Salidas] →                                       ║
╚═══════════════════════════════════════════════════════════════╝
Lógica de Trade Number:
javascriptfunction getNextTradeNumber(storage) {
  const lastTrade = storage.trades[storage.trades.length - 1];
  return lastTrade ? lastTrade.tradeNumber + 1 : 1;
}

// Usuario puede override manualmente
2.4.6 Cálculos Automáticos
javascriptfunction calculateTradeMetrics(trade) {
  // Duración
  const duration = calculateDuration(trade.openTimeBRT, trade.closeTimeBRT);
  trade.duration = formatDuration(duration); // "1d 6h 17m"
  trade.durationMinutes = duration;
  
  // Riesgo ejecutado (si es agrupado)
  if (trade.isGrouped) {
    trade.riskExecuted = trade.positions.reduce((sum, p) => {
      return sum + Math.abs(p.entry - trade.stopLoss) * p.size;
    }, 0);
  } else {
    trade.riskExecuted = Math.abs(trade.entry - trade.stopLoss) * trade.volume;
  }
  
  // R Planeado y Ejecutado
  trade.rPlanned = trade.result / trade.riskPlanned;
  trade.rExecuted = trade.result / trade.riskExecuted;
  
  // Desviación de riesgo
  trade.riskDeviation = ((trade.riskExecuted - trade.riskPlanned) / trade.riskPlanned) * 100;
  trade.riskDeviationFlag = getRiskFlag(trade.riskDeviation);
  
  // Hora de entrada (para análisis)
  trade.openHourBRT = new Date(trade.openTimeBRT).getHours();
  trade.openHourRange = getHourRange(trade.openHourBRT);
  trade.openDayOfWeek = getDayOfWeek(trade.openTimeBRT);
  
  // Bloque
  trade.block = Math.ceil(trade.tradeNumber / 10);
  
  return trade;
}

function getRiskFlag(deviation) {
  if (Math.abs(deviation) < 5) return '✓';
  if (Math.abs(deviation) < 20) return '⚠';
  return '❌';
}
2.4.7 Generación de Salidas
Salida 1: Plantilla Telegram
javascriptfunction generateTelegramTemplate(trade) {
  return `Trade N° [${trade.tradeNumber}/10]
🗓 FECHA: ${formatDate(trade.openTimeBRT)}
📊 TRADE LOG
Símbolo: ${trade.symbol}
Tipo: ${trade.type}
Entrada: $${trade.entry.toFixed(2)}
Stop Loss: $${trade.stopLoss.toFixed(2)}
Take Profit: $${trade.takeProfit.toFixed(2)}
Riesgo: $${trade.riskPlanned}
Resultado: $${trade.result.toFixed(2)}
Exit Price: $${trade.exitPrice.toFixed(2)}
Duración⏳: ${trade.duration}
R Ganado: ${trade.rPlanned.toFixed(2)}R

${trade.item ? `🏷️ Ítem: ${trade.item}\n` : ''}
${trade.observation ? `📝 Observación: ${trade.observation}\n` : ''}
🧩 Motivo de entrada:
[Completa en Telegram]

⚔️ Resultado / Gestión:
[Completa en Telegram]

💬 Reflexión:
- Qué salió bien:
- Qué salió mal:
- Qué harías distinto mañana:`;
}
Salida 2: Línea CSV para Google Sheet
javascriptfunction generateCSVLine(trade) {
  const fields = [
    trade.tradeNumber,
    trade.orderIDs.join(','),
    trade.isGrouped ? 'SÍ' : 'NO',
    trade.groupCount || 1,
    formatDateCSV(trade.openTimeBRT),
    formatTimeCSV(trade.openTimeBRT),
    trade.symbol,
    trade.type,
    trade.entry,
    trade.exitPrice,
    trade.stopLoss,
    trade.takeProfit,
    trade.riskPlanned,
    trade.riskExecuted,
    trade.result,
    trade.rPlanned.toFixed(2),
    trade.rExecuted.toFixed(2),
    trade.riskDeviationFlag,
    trade.duration,
    trade.item || '',
    trade.observation || ''
  ];
  
  return fields.map(f => `"${f}"`).join('\t'); // Tab-separated
}
Salida 3: Objeto JSON para Storage
javascriptfunction generateStorageObject(trade) {
  return {
    tradeNumber: trade.tradeNumber,
    block: trade.block,
    orderIDs: trade.orderIDs,
    isGrouped: trade.isGrouped,
    groupCount: trade.groupCount,
    positions: trade.positions || [],
    
    // Tiempos
    openTimeUTC: trade.openTimeUTC,
    closeTimeUTC: trade.closeTimeUTC,
    openTimeBRT: trade.openTimeBRT,
    closeTimeBRT: trade.closeTimeBRT,
    openHourBRT: trade.openHourBRT,
    openHourRange: trade.openHourRange,
    openDayOfWeek: trade.openDayOfWeek,
    duration: trade.duration,
    durationMinutes: trade.durationMinutes,
    
    // Trade data
    symbol: trade.symbol,
    type: trade.type,
    entry: trade.entry,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    volume: trade.volume,
    
    // Riesgo y resultado
    riskPlanned: trade.riskPlanned,
    riskExecuted: trade.riskExecuted,
    riskDeviation: trade.riskDeviation,
    riskDeviationFlag: trade.riskDeviationFlag,
    result: trade.result,
    rPlanned: trade.rPlanned,
    rExecuted: trade.rExecuted,
    
    // Metadata
    item: trade.item,
    observation: trade.observation,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
2.4.8 Interfaz de Salidas Generadas
html╔═══════════════════════════════════════════════════════════════╗
║  ✅ SALIDAS GENERADAS                                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  📱 PLANTILLA TELEGRAM                                         ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ [Texto completo de la plantilla]                        │ ║
║  │ [Scroll si es necesario]                                │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║  [📋 Copiar Plantilla Telegram]                              ║
║                                                               ║
║  ────────────────────────────────────────────────────────     ║
║                                                               ║
║  📊 LÍNEA GOOGLE SHEET                                         ║
║  ┌─────────────────────────────────────────────────────────┐ ║
║  │ [Texto tab-separated listo para pegar]                  │ ║
║  └─────────────────────────────────────────────────────────┘ ║
║  [📋 Copiar Línea Sheet]                                     ║
║                                                               ║
║  ────────────────────────────────────────────────────────     ║
║                                                               ║
║  💾 GUARDAR EN DASHBOARD                                       ║
║  [✅ Guardar automáticamente en Dashboard]                   ║
║  (Trade será añadido a window.storage)                       ║
║                                                               ║
║  [🔄 Procesar Otro Trade] [🏠 Ir al Dashboard]               ║
╚═══════════════════════════════════════════════════════════════╝
2.5 Guardado Automático en Dashboard
javascriptasync function saveToStorage(trade) {
  try {
    // Leer storage actual
    const currentData = await window.storage.get('trades-data');
    const trades = currentData ? JSON.parse(currentData.value) : [];
    
    // Validar duplicados por Order ID
    const isDuplicate = trades.some(t => 
      t.orderIDs.some(id => trade.orderIDs.includes(id))
    );
    
    if (isDuplicate) {
      throw new Error('Trade duplicado detectado');
    }
    
    // Agregar nuevo trade
    trades.push(trade);
    
    // Guardar
    await window.storage.set('trades-data', JSON.stringify(trades));
    
    // Recalcular métricas globales
    await recalculateGlobalMetrics(trades);
    
    return { success: true, totalTrades: trades.length };
  } catch (error) {
    console.error('Error saving to storage:', error);
    return { success: false, error: error.message };
  }
}
2.6 Tests del Parser
javascript// Test 1: Detección de formato
test('detectFormat identifies funding format', () => {
  const input = '3230028102025-10-28 19:59:17$4,034.29...';
  const result = detectFormat(input);
  expect(result.type).toBe('funding');
});

// Test 2: Extracción de datos
test('extractTradeData parses correctly', () => {
  const line = '...';
  const trade = extractTradeData(line);
  expect(trade.orderID).toBe('323002810');
  expect(trade.symbol).toBe('ETHUSD');
});

// Test 3: Conversión UTC → BRT
test('converts UTC to BRT correctly', () => {
  const utc = '2025-10-28T19:59:17Z';
  const brt = convertToBRT(utc);
  expect(brt).toBe('2025-10-28T16:59:17-03:00');
});

// Test 4: Detección de agrupables
test('detects groupable trades', () => {
  const trades = [
    { symbol: 'SOLUSD', side: 'SELL', openDate: '2025-10-29' },
    { symbol: 'SOLUSD', side: 'SELL', openDate: '2025-10-29' }
  ];
  const result = detectGroupableTrades(trades);
  expect(result.groupable.length).toBe(1);
});

// Test 5: Cálculos automáticos
test('calculates R correctly', () => {
  const trade = {
    result: 100,
    riskPlanned: 100,
    riskExecuted: 86
  };
  calculateTradeMetrics(trade);
  expect(trade.rPlanned).toBeCloseTo(1.0);
  expect(trade.rExecuted).toBeCloseTo(1.16);
});
```

---

## 3. MÓDULO 2: SISTEMA DE ALMACENAMIENTO

### 3.1 Arquitectura de Almacenamiento
```
┌─────────────────────────────────────────────────────────────┐
│              CAPA DE ALMACENAMIENTO                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NIVEL 1: window.storage (Persistente en navegador)        │
│  ├─ trades-data (array de trades)                          │
│  ├─ config (configuración del usuario)                     │
│  ├─ alerts-state (estado de alertas)                       │
│  └─ last-sync (timestamp de última sincronización)         │
│                                                             │
│  NIVEL 2: localStorage (Configuración ligera)              │
│  ├─ user-preferences (columnas visibles, vista, etc.)      │
│  ├─ table-state (ordenamiento, filtros)                    │
│  └─ theme (dark/light)                                      │
│                                                             │
│  NIVEL 3: Google Sheet (Backup externo)                    │
│  └─ CSV completo exportable/importable                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
3.2 Estructura de Datos en Storage
javascript// window.storage: 'trades-data'
{
  version: '1.0',
  lastUpdated: '2025-11-02T15:30:00-03:00',
  totalTrades: 36,
  trades: [
    {
      tradeNumber: 1,
      block: 1,
      orderIDs: ['323002810'],
      isGrouped: false,
      // ... todos los campos del trade
    },
    // ... más trades
  ]
}

// window.storage: 'config'
{
  version: '1.0',
  timezone: 'America/Sao_Paulo',
  capitalInicial: 10000,
  objectives: {
    winRate: 60,
    rAverage: 0.80,
    trades1_5R: 30,
    trades2R: 15,
    drawdownMax: 10,
    monthlyGrowth: 4, // %
    riskPerTrade: 150
  },
  hourRanges: [
    { start: 6, end: 9 },
    { start: 9, end: 12 },
    // ... más franjas
  ],
  alerts: {
    losingStreak: { enabled: true, threshold: 3 },
    drawdown: { enabled: true, threshold: 5 },
    // ... más alertas
  }
}
3.3 API de Almacenamiento
javascriptclass StorageManager {
  
  // Trades
  async getTrades() {
    const data = await window.storage.get('trades-data');
    return data ? JSON.parse(data.value) : { trades: [] };
  }
  
  async saveTrade(trade) {
    const data = await this.getTrades();
    data.trades.push(trade);
    data.totalTrades = data.trades.length;
    data.lastUpdated = new Date().toISOString();
    await window.storage.set('trades-data', JSON.stringify(data));
    return trade;
  }
  
  async updateTrade(tradeNumber, updates) {
    const data = await this.getTrades();
    const index = data.trades.findIndex(t => t.tradeNumber === tradeNumber);
    
    if (index === -1) throw new Error('Trade not found');
    
    data.trades[index] = { ...data.trades[index], ...updates, updatedAt: new Date().toISOString() };
    await window.storage.set('trades-data', JSON.stringify(data));
    return data.trades[index];
  }
  
  async deleteTrade(tradeNumber) {
    const data = await this.getTrades();
    data.trades = data.trades.filter(t => t.tradeNumber !== tradeNumber);
    data.totalTrades = data.trades.length;
    await window.storage.set('trades-data', JSON.stringify(data));
  }
  
  // Configuración
  async getConfig() {
    const config = await window.storage.get('config');
    return config ? JSON.parse(config.value) : getDefaultConfig();
  }
  
  async saveConfig(config) {
    await window.storage.set('config', JSON.stringify(config));
  }
  
  // Exportar/Importar
  async exportToCSV() {
    const data = await this.getTrades();
    return generateFullCSV(data.trades);
  }
  
  async importFromCSV(csvString) {
    const trades = parseCSV(csvString);
    
    // Validar estructura
    if (!validateCSVStructure(trades)) {
      throw new Error('CSV structure invalid');
    }
    
    // Merge con datos existentes (anti-duplicados)
    const existing = await this.getTrades();
    const merged = mergeTrades(existing.trades, trades);
    
    await window.storage.set('trades-data', JSON.stringify({
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      totalTrades: merged.length,
      trades: merged
    }));
    
    return { imported: trades.length, total: merged.length };
  }
  
  // Limpieza
  async clearAll() {
    await window.storage.delete('trades-data');
    await window.storage.delete('config');
    await window.storage.delete('alerts-state');
  }
}
3.4 Validación y Consistencia
javascriptfunction validateTrade(trade) {
  const required = [
    'tradeNumber', 'orderIDs', 'symbol', 'type',
    'entry', 'exitPrice', 'riskPlanned', 'result'
  ];
  
  for (const field of required) {
    if (trade[field] === undefined || trade[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validaciones de rango
  if (trade.riskPlanned <= 0) {
    throw new Error('Risk must be positive');
  }
  
  if (trade.tradeNumber <= 0) {
    throw new Error('Trade number must be positive');
  }
  
  // Validar fechas
  if (!isValidDate(trade.openTimeBRT)) {
    throw new Error('Invalid open time');
  }
  
  return true;
}

function mergeTrades(existing, incoming) {
  const merged = [...existing];
  const existingOrderIDs = new Set(
    existing.flatMap(t => t.orderIDs)
  );
  
  for (const trade of incoming) {
    const isDuplicate = trade.orderIDs.some(id => existingOrderIDs.has(id));
    
    if (!isDuplicate) {
      merged.push(trade);
      trade.orderIDs.forEach(id => existingOrderIDs.add(id));
    }
  }
  
  // Reordenar por tradeNumber
  return merged.sort((a, b) => a.tradeNumber - b.tradeNumber);
}
3.5 Sistema de Sincronización
javascriptclass SyncManager {
  
  async syncStatus() {
    const lastSync = await window.storage.get('last-sync');
    const tradesData = await window.storage.get('trades-data');
    
    return {
      lastSync: lastSyncReintentarMContinuarjavascript      lastSync: lastSync ? new Date(lastSync.value) : null,
      totalTrades: tradesData ? JSON.parse(tradesData.value).totalTrades : 0,
      needsSync: this.checkIfNeedsSync(lastSync),
      status: lastSync ? 'synced' : 'never-synced'
    };
  }
  
  checkIfNeedsSync(lastSync) {
    if (!lastSync) return true;
    
    const hoursSinceSync = (Date.now() - new Date(lastSync.value)) / (1000 * 60 * 60);
    return hoursSinceSync > 48; // Sugerir sync cada 2 días
  }
  
  async markAsSynced() {
    await window.storage.set('last-sync', new Date().toISOString());
  }
  
  async exportForSync() {
    const storage = new StorageManager();
    const csv = await storage.exportToCSV();
    const config = await storage.getConfig();
    
    return {
      csv,
      config: JSON.stringify(config),
      exportDate: new Date().toISOString()
    };
  }
}
3.6 Tests de Almacenamiento
javascript// Test 1: Guardar trade
test('saves trade successfully', async () => {
  const storage = new StorageManager();
  const trade = createMockTrade();
  const result = await storage.saveTrade(trade);
  expect(result.tradeNumber).toBe(trade.tradeNumber);
});

// Test 2: Prevenir duplicados
test('prevents duplicate trades', async () => {
  const storage = new StorageManager();
  const trade = createMockTrade();
  await storage.saveTrade(trade);
  await expect(storage.saveTrade(trade)).rejects.toThrow();
});

// Test 3: Actualizar trade
test('updates trade correctly', async () => {
  const storage = new StorageManager();
  const trade = await storage.saveTrade(createMockTrade());
  const updated = await storage.updateTrade(trade.tradeNumber, { observation: 'Nueva obs' });
  expect(updated.observation).toBe('Nueva obs');
});

// Test 4: Merge sin duplicados
test('merges trades without duplicates', () => {
  const existing = [{ tradeNumber: 1, orderIDs: ['123'] }];
  const incoming = [
    { tradeNumber: 1, orderIDs: ['123'] }, // Duplicado
    { tradeNumber: 2, orderIDs: ['456'] }  // Nuevo
  ];
  const merged = mergeTrades(existing, incoming);
  expect(merged.length).toBe(2);
});

// Test 5: Validación de datos
test('validates trade structure', () => {
  const invalidTrade = { tradeNumber: 1 }; // Faltan campos
  expect(() => validateTrade(invalidTrade)).toThrow();
});
```

---

## 4. MÓDULO 3: GOOGLE SHEETS INTEGRATION

### 4.1 Estructura del Google Sheet

**Nombre sugerido:** `Trading Journal - [Tu Nombre]`

### 4.2 Pestaña: TRADES (Principal)

**Estructura de columnas:**

| Col | Nombre | Tipo | Ejemplo | Descripción |
|-----|--------|------|---------|-------------|
| A | Trade N° | Número | 5 | Identificador único |
| B | Order IDs | Texto | 323896706, 323881865 | IDs de plataforma (separados por coma si agrupado) |
| C | Agrupado | Texto | SÍ/NO | Indica si es trade agrupado |
| D | N° Posiciones | Número | 2 | Cantidad de posiciones (1 si individual) |
| E | Fecha | Fecha | 28/10/2025 | Fecha de apertura (BRT) |
| F | Hora | Hora | 16:59 | Hora de apertura (BRT) |
| G | Símbolo | Texto | SOLUSD | Par operado |
| H | Tipo | Texto | SHORT | LONG o SHORT |
| I | Entry | Número | 197.96 | Precio de entrada (promedio si agrupado) |
| J | Exit | Número | 196.13 | Precio de salida (promedio si agrupado) |
| K | SL | Número | 202.00 | Stop Loss |
| L | TP | Número | 190.00 | Take Profit |
| M | Riesgo Plan | Número | 100 | Riesgo planeado ($) |
| N | Riesgo Exec | Número | 86 | Riesgo ejecutado ($) |
| O | Resultado | Número | 21.96 | P&L en $ |
| P | R Plan | Número | 0.22 | R basado en riesgo planeado |
| Q | R Exec | Número | 0.26 | R basado en riesgo ejecutado |
| R | Δ | Texto | ⚠ | Indicador de desviación |
| S | Duración | Texto | 10h 42m | Tiempo del trade |
| T | Ítem | Texto | Setup limpio | Etiqueta del trade |
| U | Observación | Texto | Salí antes... | Nota breve |

### 4.3 Fórmulas en Google Sheet

**Fila de encabezado con formato:**
- Negrita, fondo gris oscuro, texto blanco
- Filtros habilitados

**Columna P (R Plan) - Si no viene del CSV:**
```
=O2/M2
```

**Columna Q (R Exec) - Si no viene del CSV:**
```
=O2/N2
```

**Columna R (Δ - Indicador) - Si no viene del CSV:**
```
=IF(ABS((N2-M2)/M2)<0.05,"✓",IF(ABS((N2-M2)/M2)<0.2,"⚠","❌"))
```

**Fila de resumen (al final de cada 10 trades):**
```
Trade N°: [Vacío]
Bloque: =CEILING(A2/10)
Total P&L: =SUM(O2:O11)
Avg R: =AVERAGE(P2:P11)
Win Rate: =COUNTIF(O2:O11,">0")/10
4.4 Formato Condicional
Columna O (Resultado):

Verde: >0
Rojo: <0
Gris: =0

Columna R (Δ):

✓: Verde claro
⚠: Amarillo
❌: Rojo claro

Columna P (R Plan):

Verde intenso: ≥1.5R
Verde medio: 1R-1.5R
Verde claro: 0-1R
Rojo claro: -1R-0
Rojo intenso: <-1R

4.5 Exportación desde Dashboard
javascriptfunction exportToCSV(trades) {
  const headers = [
    'Trade N°', 'Order IDs', 'Agrupado', 'N° Pos', 'Fecha', 'Hora',
    'Símbolo', 'Tipo', 'Entry', 'Exit', 'SL', 'TP',
    'Riesgo Plan', 'Riesgo Exec', 'Resultado', 'R Plan', 'R Exec',
    'Δ', 'Duración', 'Ítem', 'Observación'
  ];
  
  let csv = headers.join('\t') + '\n';
  
  trades.forEach(trade => {
    const row = [
      trade.tradeNumber,
      trade.orderIDs.join(', '),
      trade.isGrouped ? 'SÍ' : 'NO',
      trade.groupCount || 1,
      formatDateForSheet(trade.openTimeBRT),
      formatTimeForSheet(trade.openTimeBRT),
      trade.symbol,
      trade.type,
      trade.entry,
      trade.exitPrice,
      trade.stopLoss,
      trade.takeProfit,
      trade.riskPlanned,
      trade.riskExecuted,
      trade.result,
      trade.rPlanned.toFixed(2),
      trade.rExecuted.toFixed(2),
      trade.riskDeviationFlag,
      trade.duration,
      trade.item || '',
      trade.observation || ''
    ];
    
    csv += row.map(v => `"${v}"`).join('\t') + '\n';
  });
  
  return csv;
}

function downloadCSV(csv, filename = 'trades-export.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
4.6 Importación al Dashboard
javascriptfunction parseCSV(csvString) {
  const lines = csvString.split('\n').filter(Boolean);
  const headers = lines[0].split('\t').map(h => h.replace(/"/g, '').trim());
  
  const trades = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t').map(v => v.replace(/"/g, '').trim());
    
    if (values.length !== headers.length) continue; // Saltar líneas inválidas
    
    const trade = {};
    headers.forEach((header, index) => {
      trade[mapHeaderToField(header)] = parseValue(values[index], header);
    });
    
    // Reconstruir campos derivados
    trade.block = Math.ceil(trade.tradeNumber / 10);
    trade.orderIDs = trade.orderIDs.split(',').map(id => id.trim());
    
    trades.push(trade);
  }
  
  return trades;
}

function mapHeaderToField(header) {
  const mapping = {
    'Trade N°': 'tradeNumber',
    'Order IDs': 'orderIDs',
    'Agrupado': 'isGrouped',
    'N° Pos': 'groupCount',
    'Fecha': 'date',
    'Hora': 'time',
    'Símbolo': 'symbol',
    'Tipo': 'type',
    'Entry': 'entry',
    'Exit': 'exitPrice',
    'SL': 'stopLoss',
    'TP': 'takeProfit',
    'Riesgo Plan': 'riskPlanned',
    'Riesgo Exec': 'riskExecuted',
    'Resultado': 'result',
    'R Plan': 'rPlanned',
    'R Exec': 'rExecuted',
    'Δ': 'riskDeviationFlag',
    'Duración': 'duration',
    'Ítem': 'item',
    'Observación': 'observation'
  };
  
  return mapping[header] || header;
}

function parseValue(value, header) {
  if (!value || value === '') return null;
  
  // Números
  if (['Entry', 'Exit', 'SL', 'TP', 'Riesgo Plan', 'Riesgo Exec', 'Resultado', 'R Plan', 'R Exec'].includes(header)) {
    return parseFloat(value);
  }
  
  // Booleanos
  if (header === 'Agrupado') {
    return value.toUpperCase() === 'SÍ';
  }
  
  // Números enteros
  if (['Trade N°', 'N° Pos'].includes(header)) {
    return parseInt(value);
  }
  
  return value;
}
4.7 Sincronización Bidireccional
javascriptclass SheetSync {
  
  async exportToSheet() {
    const storage = new StorageManager();
    const data = await storage.getTrades();
    const csv = exportToCSV(data.trades);
    
    downloadCSV(csv, `trading-journal-${formatDate(new Date())}.csv`);
    
    // Marcar como sincronizado
    const syncManager = new SyncManager();
    await syncManager.markAsSynced();
    
    return { exported: data.trades.length };
  }
  
  async importFromSheet(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const csvString = e.target.result;
          const trades = parseCSV(csvString);
          
          // Validar antes de importar
          trades.forEach(validateTrade);
          
          // Importar a storage
          const storage = new StorageManager();
          const result = await storage.importFromCSV(csvString);
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Error reading file'));
      reader.readAsText(file);
    });
  }
  
  async checkConsistency() {
    // Comparar Sheet con Storage
    const storage = new StorageManager();
    const localTrades = await storage.getTrades();
    
    return {
      localCount: localTrades.trades.length,
      lastSync: await new SyncManager().syncStatus(),
      recommendation: this.getRecommendation(localTrades.trades.length)
    };
  }
  
  getRecommendation(localCount) {
    if (localCount === 0) return 'Import from Sheet to start';
    if (localCount % 10 === 0) return 'Good time to sync (block completed)';
    return 'Sync when convenient';
  }
}
4.8 Pestaña: CONFIG (Configuración exportable)
Estructura:
CampoValorDescripciónCapital Inicial10000Capital de inicioObjetivo Mensual (%)4Meta de crecimientoWin Rate Objetivo (%)60Meta de aciertoR Promedio Objetivo0.80Meta de RZona HorariaAmerica/Sao_PauloZona horaria configuradaÚltima Actualización02/11/2025Timestamp
Función de exportar config:
javascriptfunction exportConfigToSheet() {
  const config = await new StorageManager().getConfig();
  
  const csv = `Campo\tValor\n` +
    `Capital Inicial\t${config.capitalInicial}\n` +
    `Objetivo Mensual (%)\t${config.objectives.monthlyGrowth}\n` +
    `Win Rate Objetivo (%)\t${config.objectives.winRate}\n` +
    `R Promedio Objetivo\t${config.objectives.rAverage}\n` +
    `Zona Horaria\t${config.timezone}\n` +
    `Última Actualización\t${new Date().toLocaleString('pt-BR')}`;
  
  downloadCSV(csv, 'config-export.csv');
}
4.9 Tests de Integración
javascript// Test 1: Exportar CSV
test('exports CSV with correct structure', async () => {
  const trades = createMockTrades(10);
  const csv = exportToCSV(trades);
  const lines = csv.split('\n');
  expect(lines[0]).toContain('Trade N°');
  expect(lines.length).toBe(12); // Header + 10 trades + final newline
});

// Test 2: Importar CSV
test('imports CSV correctly', async () => {
  const csv = createMockCSV();
  const trades = parseCSV(csv);
  expect(trades.length).toBe(10);
  expect(trades[0].tradeNumber).toBe(1);
});

// Test 3: Prevenir duplicados en import
test('prevents duplicates on import', async () => {
  const storage = new StorageManager();
  await storage.saveTrade(createMockTrade());
  const csv = createMockCSVWithDuplicate();
  const result = await storage.importFromCSV(csv);
  expect(result.imported).toBeLessThan(result.total);
});

// Test 4: Validar estructura CSV
test('validates CSV structure', () => {
  const invalidCSV = 'InvalidHeader\n1\n2';
  expect(() => parseCSV(invalidCSV)).toThrow();
});
```

---

## 5. MÓDULO 4: DASHBOARD HTML (5 VISTAS)

### 5.1 Arquitectura del Dashboard

**Archivo principal:** `dashboard.html`

**Estructura de componentes:**
```
Dashboard
├── Header (navegación, sync status, alertas)
├── Sidebar (navegación entre vistas)
├── MainContent
│   ├── Vista 1: Tabla de Trades
│   ├── Vista 2: Análisis por Bloques
│   ├── Vista 3: Progreso Continuo
│   ├── Vista 4: Análisis Temporal
│   └── Vista 5: Expected Value
├── ConfigModal (configuración)
└── AlertBanner (notificaciones)
5.2 VISTA 1: TABLA DE TRADES
5.2.1 Propósito
Base de datos completa de todos los trades con funcionalidad de expansión, edición y filtrado.
5.2.2 Componentes
TradeTable Component:
javascriptclass TradeTable {
  constructor(containerEl, trades) {
    this.container = containerEl;
    this.trades = trades;
    this.expandedRows = new Set();
    this.visibleColumns = this.getColumnPreferences();
    this.sortBy = 'tradeNumber';
    this.sortDesc = false;
  }
  
  render() {
    const filteredTrades = this.applyFilters(this.trades);
    const sortedTrades = this.sortTrades(filteredTrades);
    
    this.container.innerHTML = `
      <div class="trade-table-container">
        ${this.renderHeader()}
        ${this.renderColumnSelector()}
        ${this.renderTable(sortedTrades)}
        ${this.renderPagination(sortedTrades)}
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  renderHeader() {
    return `
      <div class="table-header">
        <h2>📊 TRADES - Base de Datos (${this.trades.length} trades)</h2>
        <div class="table-actions">
          <select id="view-select">
            <option value="compact">Vista: Compacta</option>
            <option value="detailed">Vista: Detallada</option>
            <option value="r-plan-only">Vista: Solo R Planeado</option>
          </select>
          <input type="text" id="search" placeholder="🔍 Buscar...">
          <button id="columns-btn">⚙️ Columnas</button>
          <button id="export-btn">📤 Export CSV</button>
          <button id="add-trade-btn">➕ Agregar Trade</button>
        </div>
      </div>
    `;
  }
  
  renderColumnSelector() {
    return `
      <div class="column-selector" id="column-selector" style="display:none;">
        <label><input type="checkbox" value="basics" checked> Básicas</label>
        <label><input type="checkbox" value="prices" checked> Precios</label>
        <label><input type="checkbox" value="risk" checked> Riesgo/R</label>
        <label><input type="checkbox" value="duration" checked> Duración</label>
        <label><input type="checkbox" value="sltp"> SL/TP</label>
        <label><input type="checkbox" value="orderIds"> Order IDs</label>
        <label><input type="checkbox" value="itemObs"> Ítem/Obs</label>
      </div>
    `;
  }
  
  renderTable(trades) {
    return `
      <table class="trades-table">
        <thead>
          ${this.renderTableHeader()}
        </thead>
        <tbody>
          ${trades.map(trade => this.renderTradeRow(trade)).join('')}
        </tbody>
      </table>
    `;
  }
  
  renderTableHeader() {
    const columns = this.getVisibleColumns();
    return `
      <tr>
        ${columns.map(col => `
          <th class="sortable" data-sort="${col.key}">
            ${col.label}
            ${this.sortBy === col.key ? (this.sortDesc ? '▼' : '▲') : ''}
          </th>
        `).join('')}
        <th>ⓘ</th>
      </tr>
    `;
  }
  
  renderTradeRow(trade) {
    const isExpanded = this.expandedRows.has(trade.tradeNumber);
    const columns = this.getVisibleColumns();
    
    return `
      <tr class="trade-row ${isExpanded ? 'expanded' : ''}" data-trade="${trade.tradeNumber}">
        ${columns.map(col => `
          <td class="${col.className || ''}">${this.formatCellValue(trade, col.key)}</td>
        `).join('')}
        <td>
          <button class="expand-btn" data-trade="${trade.tradeNumber}">
            ${isExpanded ? '▲' : '▼'}
          </button>
        </td>
      </tr>
      ${isExpanded ? this.renderExpandedRow(trade) : ''}
    `;
  }
  
  renderExpandedRow(trade) {
    return `
      <tr class="expanded-content" data-trade="${trade.tradeNumber}">
        <td colspan="${this.getVisibleColumns().length + 1}">
          <div class="trade-details">
            ${this.renderTradeDetails(trade)}
          </div>
        </td>
      </tr>
    `;
  }
  
  renderTradeDetails(trade) {
    return `
      <div class="details-grid">
        <div class="detail-section">
          <h4>📋 DETALLES COMPLETOS</h4>
          ${trade.isGrouped ? `
            <p>🔗 Order IDs: ${trade.orderIDs.join(', ')} (${trade.groupCount} posiciones agrupadas)</p>
          ` : `
            <p>Order ID: ${trade.orderIDs[0]}</p>
          `}
          <p>📊 SL: $${trade.stopLoss.toFixed(2)} | TP: $${trade.takeProfit.toFixed(2)} | Exit: $${trade.exitPrice.toFixed(2)}</p>
        </div>
        
        <div class="detail-section">
          <h4>💰 ANÁLISIS DE RIESGO</h4>
          <div class="risk-analysis">
            <p>Riesgo Planeado: $${trade.riskPlanned.toFixed(2)} (tu decisión inicial)</p>
            <p>Riesgo Ejecutado: $${trade.riskExecuted.toFixed(2)} (riesgo real calculado)</p>
            <p>Desviación: ${trade.riskDeviation.toFixed(1)}% (${trade.riskDeviation < 0 ? 'arriesgaste MENOS' : 'arriesgaste MÁS'})</p>
            <p>R Planeado: $${trade.result.toFixed(2)} / $${trade.riskPlanned} = ${trade.rPlanned.toFixed(2)}R ← Usado en métricas</p>
            <p>R Ejecutado: $${trade.result.toFixed(2)} / $${trade.riskExecuted} = ${trade.rExecuted.toFixed(2)}R ← Referencia técnica</p>
            ${this.getRiskInsight(trade)}
          </div>
        </div>
        
        ${trade.isGrouped ? this.renderPositionsBreakdown(trade) : ''}
        
        <div class="detail-section">
          <h4>🏷️ Ítem</h4>
          <input type="text" class="editable-field" data-field="item" value="${trade.item || ''}" placeholder="Ej: Setup limpio">
        </div>
        
        <div class="detail-section">
          <h4>📝 Observación</h4>
          <textarea class="editable-field" data-field="observation" placeholder="Notas sobre este trade...">${trade.observation || ''}</textarea>
        </div>
        
        <div class="detail-actions">
          <button class="btn-edit" data-trade="${trade.tradeNumber}">✏️ Guardar Cambios</button>
          <button class="btn-delete" data-trade="${trade.tradeNumber}">🗑️ Eliminar</button>
          <button class="btn-close" data-trade="${trade.tradeNumber}">▲ Cerrar</button>
        </div>
      </div>
    `;
  }
  
  renderPositionsBreakdown(trade) {
    return `
      <div class="detail-section">
        <h4>🔎 POSICIONES INDIVIDUALES</h4>
        ${trade.positions.map((pos, idx) => `
          <div class="position-card">
            <p><strong>Posición ${idx + 1}</strong> (Order: ${pos.orderID})</p>
            <p>Entry: $${pos.entry.toFixed(2)} → Exit: $${pos.exit.toFixed(2)}</p>
            <p>Size: ${pos.size} | SL: $${trade.stopLoss.toFixed(2)}</p>
            <p>Riesgo calculado: $${pos.riskCalculated.toFixed(2)}</p>
            <p>P&L: $${pos.pnl.toFixed(2)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  getRiskInsight(trade) {
    if (Math.abs(trade.riskDeviation) < 5) {
      return `<p class="insight">✅ Ejecución precisa. Riesgo planeado y ejecutado casi idénticos.</p>`;
    } else if (trade.riskDeviation < 0) {
      return `<p class="insight">💡 Ejecutaste con menos riesgo (conservador). R ejecutado es mayor pero no refleja tu proceso de decisión.</p>`;
    } else {
      return `<p class="insight">⚠️ Arriesgaste más de lo planeado. Revisa tu gestión de riesgo.</p>`;
    }
  }
  
  formatCellValue(trade, key) {
    switch(key) {
      case 'tradeNumber':
        return trade.tradeNumber;
      case 'block':
        return trade.block;
      case 'dateTime':
        return `${formatDate(trade.openTimeBRT)} ${formatTime(trade.openTimeBRT)}`;
      case 'symbol':
        return `${trade.symbol}${trade.isGrouped ? ' 🔗' : ''}`;
      case 'type':
        return trade.type;
      case 'entryExit':
        return `${trade.entry.toFixed(2)}→${trade.exitPrice.toFixed(2)}`;
      case 'riskPlan':
        return `$${trade.riskPlanned}`;
      case 'riskExec':
        return `$${trade.riskExecuted}`;
      case 'rPlan':
        return `${trade.rPlanned.toFixed(2)}R`;
      case 'rExec':
        return `${trade.rExecuted.toFixed(2)}R`;
      case 'delta':
        return trade.riskDeviationFlag;
      case 'duration':
        return trade.duration;
      case 'result':
        const className = trade.result >= 0 ? 'positive' : 'negative';
        return `<span class="${className}">${trade.result >= 0 ? '+' : ''}$${trade.result.toFixed(2)}</span>`;
      default:
        return trade[key] || '';
    }
  }
  
  attachEventListeners() {
    // Expandir/colapsar
    document.querySelectorAll('.expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tradeNumber = parseInt(e.target.dataset.trade);
        this.toggleExpand(tradeNumber);
      });
    });
    
    // Editar campos
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.saveTradeEdits(parseInt(e.target.dataset.trade));
      });
    });
    
    // Eliminar trade
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.deleteTrade(parseInt(e.target.dataset.trade));
      });
    });
    
    // Ordenamiento
    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', (e) => {
        this.sortByColumn(e.target.dataset.sort);
      });
    });
    
    // Agregar trade
    document.getElementById('add-trade-btn').addEventListener('click', () => {
      this.openAddTradeModal();
    });
    
    // Export
    document.getElementById('export-btn').addEventListener('click', () => {
      new SheetSync().exportToSheet();
    });
  }
  
  toggleExpand(tradeNumber) {
    if (this.expandedRows.has(tradeNumber)) {
      this.expandedRows.delete(tradeNumber);
    } else {
      this.expandedRows.add(tradeNumber);
    }
    this.render();
  }
  
  async saveTradeEdits(tradeNumber) {
    const row = document.querySelector(`[data-trade="${tradeNumber}"]`);
    const fields = row.querySelectorAll('.editable-field');
    
    const updates = {};
    fields.forEach(field => {
      updates[field.dataset.field] = field.value;
    });
    
    const storage = new StorageManager();
    await storage.updateTrade(tradeNumber, updates);
    
    showNotification('Trade actualizado correctamente', 'success');
    this.render();
  }
  
  async deleteTrade(tradeNumber) {
    if (!confirm('¿Seguro que deseas eliminar este trade?')) return;
    
    const storage = new StorageManager();
    await storage.deleteTrade(tradeNumber);
    
    // Recalcular métricas
    await recalculateGlobalMetrics();
    
    showNotification('Trade eliminado', 'success');
    this.render();
  }
  
  openAddTradeModal() {
    // Modal para agregar trade manualmente
    const modal = document.getElementById('add-trade-modal');
    modal.style.display = 'block';
  }
}
5.2.3 Agregar Trade Manualmente (ReintentarMContinuarjavascript#### 5.2.3 Agregar Trade Manualmente (desde Dashboard)
```javascript
class AddTradeModal {
  constructor() {
    this.modal = null;
    this.form = null;
  }
  
  open() {
    this.render();
    this.modal.style.display = 'block';
    this.attachEventListeners();
    this.prefillTradeNumber();
  }
  
  render() {
    const modalHTML = `
      <div id="add-trade-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>➕ Agregar Trade Manualmente</h2>
            <button class="close-modal">&times;</button>
          </div>
          
          <form id="add-trade-form">
            <div class="form-grid">
              
              <div class="form-section">
                <h3>📊 Datos Básicos</h3>
                
                <div class="form-group">
                  <label>Trade N°</label>
                  <input type="number" name="tradeNumber" id="trade-number" required>
                  <small>Auto-detectado (editable)</small>
                </div>
                
                <div class="form-group">
                  <label>Fecha/Hora Apertura (BRT)</label>
                  <input type="datetime-local" name="openTime" required>
                </div>
                
                <div class="form-group">
                  <label>Símbolo</label>
                  <input type="text" name="symbol" placeholder="Ej: BTCUSDT" required>
                </div>
                
                <div class="form-group">
                  <label>Tipo</label>
                  <select name="type" required>
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                </div>
              </div>
              
              <div class="form-section">
                <h3>💰 Precios</h3>
                
                <div class="form-group">
                  <label>Precio Entrada</label>
                  <input type="number" step="0.01" name="entry" required>
                </div>
                
                <div class="form-group">
                  <label>Precio Salida</label>
                  <input type="number" step="0.01" name="exit" required>
                </div>
                
                <div class="form-group">
                  <label>Stop Loss</label>
                  <input type="number" step="0.01" name="stopLoss" required>
                </div>
                
                <div class="form-group">
                  <label>Take Profit</label>
                  <input type="number" step="0.01" name="takeProfit" required>
                </div>
              </div>
              
              <div class="form-section">
                <h3>⚖️ Riesgo y Resultado</h3>
                
                <div class="form-group">
                  <label>Riesgo Planeado ($)</label>
                  <input type="number" step="0.01" name="riskPlanned" required>
                  <small>Lo que decidiste arriesgar</small>
                </div>
                
                <div class="form-group">
                  <label>Resultado ($)</label>
                  <input type="number" step="0.01" name="result" required>
                  <small>Ganancia o pérdida</small>
                </div>
                
                <div class="form-group">
                  <label>Size/Volume</label>
                  <input type="number" step="0.01" name="volume" required>
                </div>
                
                <div class="calculated-fields">
                  <p>R Planeado: <span id="calc-r-plan">-</span></p>
                  <p>R Ejecutado: <span id="calc-r-exec">-</span></p>
                  <p>Duración: <span id="calc-duration">-</span></p>
                </div>
              </div>
              
              <div class="form-section">
                <h3>📝 Metadata</h3>
                
                <div class="form-group">
                  <label>Order ID (opcional)</label>
                  <input type="text" name="orderID" placeholder="ID de la plataforma">
                </div>
                
                <div class="form-group">
                  <label>Fecha/Hora Cierre (BRT)</label>
                  <input type="datetime-local" name="closeTime">
                </div>
                
                <div class="form-group">
                  <label>Ítem</label>
                  <input type="text" name="item" placeholder="Ej: Setup limpio">
                </div>
                
                <div class="form-group">
                  <label>Observación</label>
                  <textarea name="observation" rows="3" placeholder="Notas sobre el trade..."></textarea>
                </div>
              </div>
              
            </div>
            
            <div class="form-actions">
              <button type="button" class="btn-secondary" id="cancel-add">Cancelar</button>
              <button type="submit" class="btn-primary">💾 Guardar Trade</button>
            </div>
          </form>
          
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('add-trade-modal');
    this.form = document.getElementById('add-trade-form');
  }
  
  async prefillTradeNumber() {
    const storage = new StorageManager();
    const data = await storage.getTrades();
    const nextNumber = data.trades.length > 0 
      ? Math.max(...data.trades.map(t => t.tradeNumber)) + 1 
      : 1;
    
    document.getElementById('trade-number').value = nextNumber;
  }
  
  attachEventListeners() {
    // Cerrar modal
    this.modal.querySelector('.close-modal').addEventListener('click', () => {
      this.close();
    });
    
    document.getElementById('cancel-add').addEventListener('click', () => {
      this.close();
    });
    
    // Calcular campos automáticamente mientras escribe
    const autoCalcFields = ['riskPlanned', 'result', 'entry', 'stopLoss', 'volume', 'openTime', 'closeTime'];
    autoCalcFields.forEach(field => {
      this.form.querySelector(`[name="${field}"]`)?.addEventListener('input', () => {
        this.updateCalculatedFields();
      });
    });
    
    // Submit form
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
  }
  
  updateCalculatedFields() {
    const formData = new FormData(this.form);
    const riskPlanned = parseFloat(formData.get('riskPlanned')) || 0;
    const result = parseFloat(formData.get('result')) || 0;
    const entry = parseFloat(formData.get('entry')) || 0;
    const stopLoss = parseFloat(formData.get('stopLoss')) || 0;
    const volume = parseFloat(formData.get('volume')) || 0;
    
    // R Planeado
    if (riskPlanned > 0) {
      const rPlan = result / riskPlanned;
      document.getElementById('calc-r-plan').textContent = `${rPlan.toFixed(2)}R`;
    }
    
    // R Ejecutado
    if (entry > 0 && stopLoss > 0 && volume > 0) {
      const riskExec = Math.abs(entry - stopLoss) * volume;
      const rExec = result / riskExec;
      document.getElementById('calc-r-exec').textContent = `${rExec.toFixed(2)}R (Riesgo: $${riskExec.toFixed(2)})`;
    }
    
    // Duración
    const openTime = formData.get('openTime');
    const closeTime = formData.get('closeTime');
    if (openTime && closeTime) {
      const duration = calculateDuration(openTime, closeTime);
      document.getElementById('calc-duration').textContent = formatDuration(duration);
    }
  }
  
  async handleSubmit() {
    try {
      const formData = new FormData(this.form);
      
      // Construir objeto trade
      const trade = this.buildTradeObject(formData);
      
      // Validar
      validateTrade(trade);
      
      // Guardar en storage
      const storage = new StorageManager();
      await storage.saveTrade(trade);
      
      // Actualizar métricas globales
      await recalculateGlobalMetrics();
      
      // Notificar y cerrar
      showNotification('Trade agregado correctamente', 'success');
      this.close();
      
      // Recargar vista
      window.location.reload();
      
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  }
  
  buildTradeObject(formData) {
    const openTimeBRT = formData.get('openTime');
    const closeTimeBRT = formData.get('closeTime') || openTimeBRT;
    const entry = parseFloat(formData.get('entry'));
    const stopLoss = parseFloat(formData.get('stopLoss'));
    const volume = parseFloat(formData.get('volume'));
    const result = parseFloat(formData.get('result'));
    const riskPlanned = parseFloat(formData.get('riskPlanned'));
    
    // Calcular riesgo ejecutado
    const riskExecuted = Math.abs(entry - stopLoss) * volume;
    
    // Calcular R
    const rPlanned = result / riskPlanned;
    const rExecuted = result / riskExecuted;
    
    // Calcular desviación
    const riskDeviation = ((riskExecuted - riskPlanned) / riskPlanned) * 100;
    const riskDeviationFlag = getRiskFlag(riskDeviation);
    
    // Calcular duración
    const duration = calculateDuration(openTimeBRT, closeTimeBRT);
    
    // Extraer hora de entrada
    const openDate = new Date(openTimeBRT);
    const openHourBRT = openDate.getHours();
    const openHourRange = getHourRange(openHourBRT);
    const openDayOfWeek = getDayOfWeek(openTimeBRT);
    
    return {
      tradeNumber: parseInt(formData.get('tradeNumber')),
      block: Math.ceil(parseInt(formData.get('tradeNumber')) / 10),
      orderIDs: formData.get('orderID') ? [formData.get('orderID')] : [`MAN_${Date.now()}`],
      isGrouped: false,
      groupCount: 1,
      positions: [],
      
      // Tiempos
      openTimeBRT,
      closeTimeBRT,
      openTimeUTC: convertToUTC(openTimeBRT),
      closeTimeUTC: convertToUTC(closeTimeBRT),
      openHourBRT,
      openHourRange,
      openDayOfWeek,
      duration: formatDuration(duration),
      durationMinutes: duration,
      
      // Trade data
      symbol: formData.get('symbol').toUpperCase(),
      type: formData.get('type'),
      entry,
      exitPrice: parseFloat(formData.get('exit')),
      stopLoss,
      takeProfit: parseFloat(formData.get('takeProfit')),
      volume,
      
      // Riesgo y resultado
      riskPlanned,
      riskExecuted,
      riskDeviation,
      riskDeviationFlag,
      result,
      rPlanned,
      rExecuted,
      
      // Metadata
      item: formData.get('item') || null,
      observation: formData.get('observation') || null,
      
      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  
  close() {
    this.modal.remove();
  }
}
```

**Consistencia de Guardado con Agregar Trade Manual:**

1. **Mismo formato que Parser:** El trade manual pasa por `buildTradeObject()` que genera exactamente la misma estructura que el Parser.

2. **Validación idéntica:** Usa la misma función `validateTrade()` que el Parser.

3. **Storage unificado:** Llama a `storage.saveTrade()` que ya tiene anti-duplicados y validaciones.

4. **Recálculo automático:** Después de guardar, se llama a `recalculateGlobalMetrics()` para actualizar todas las métricas al instante.

5. **Actualización inmediata:** `window.location.reload()` recarga el dashboard mostrando el nuevo trade en todas las vistas.

---

### 5.3 VISTA 2: ANÁLISIS POR BLOQUES

#### 5.3.1 Propósito
Mostrar performance agrupada por bloques de 10 trades con capacidad de expandir para ver trades individuales.
```javascript
class BlockAnalysis {
  constructor(containerEl, trades) {
    this.container = containerEl;
    this.trades = trades;
    this.blocks = this.groupTradesByBlock(trades);
    this.expandedBlocks = new Set();
  }
  
  groupTradesByBlock(trades) {
    const blocks = {};
    
    trades.forEach(trade => {
      const blockNum = trade.block;
      if (!blocks[blockNum]) {
        blocks[blockNum] = [];
      }
      blocks[blockNum].push(trade);
    });
    
    return Object.keys(blocks)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(blockNum => ({
        number: parseInt(blockNum),
        trades: blocks[blockNum],
        metrics: this.calculateBlockMetrics(blocks[blockNum])
      }));
  }
  
  calculateBlockMetrics(trades) {
    const winners = trades.filter(t => t.result > 0);
    const losers = trades.filter(t => t.result <= 0);
    
    const winRate = (winners.length / trades.length) * 100;
    const rAverage = trades.reduce((sum, t) => sum + t.rPlanned, 0) / trades.length;
    const pnlTotal = trades.reduce((sum, t) => sum + t.result, 0);
    
    const tradesAbove1R = trades.filter(t => t.rPlanned >= 1).length;
    const tradesAbove1_5R = trades.filter(t => t.rPlanned >= 1.5).length;
    const tradesAbove2R = trades.filter(t => t.rPlanned >= 2).length;
    
    const bestTrade = trades.reduce((best, t) => t.rPlanned > best.rPlanned ? t : best, trades[0]);
    const worstTrade = trades.reduce((worst, t) => t.rPlanned < worst.rPlanned ? t : worst, trades[0]);
    
    const dateRange = {
      start: trades[0].openTimeBRT,
      end: trades[trades.length - 1].closeTimeBRT
    };
    
    return {
      totalTrades: trades.length,
      winRate,
      rAverage,
      pnlTotal,
      tradesAbove1R,
      tradesAbove1_5R,
      tradesAbove2R,
      bestTrade,
      worstTrade,
      dateRange,
      winners: winners.length,
      losers: losers.length
    };
  }
  
  render() {
    this.container.innerHTML = `
      <div class="block-analysis">
        <h2>📦 ANÁLISIS POR BLOQUES - Progreso de Trading</h2>
        
        ${this.renderBlockList()}
        
        ${this.renderBlockChart()}
        
        ${this.renderInsights()}
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  renderBlockList() {
    return `
      <div class="block-list">
        ${this.blocks.map(block => this.renderBlockCard(block)).join('')}
      </div>
    `;
  }
  
  renderBlockCard(block) {
    const isExpanded = this.expandedBlocks.has(block.number);
    const isComplete = block.metrics.totalTrades === 10;
    const m = block.metrics;
    
    return `
      <div class="block-card ${isComplete ? 'complete' : 'incomplete'}" data-block="${block.number}">
        <div class="block-header">
          <div class="block-title">
            <h3>${isExpanded ? '▼' : '▶'} BLOQUE ${block.number} (Trades ${(block.number - 1) * 10 + 1}-${block.number * 10})</h3>
            <span class="block-date">${formatDate(m.dateRange.start)} - ${formatDate(m.dateRange.end)}</span>
          </div>
          
          <div class="block-summary">
            <span class="metric">Trades: ${m.totalTrades}${!isComplete ? ' ⏳' : ''}</span>
            <span class="metric">Win%: ${m.winRate.toFixed(0)}%</span>
            <span class="metric">R Avg: ${m.rAverage.toFixed(2)}R</span>
            <span class="metric ${m.pnlTotal >= 0 ? 'positive' : 'negative'}">P&L: ${m.pnlTotal >= 0 ? '+' : ''}$${m.pnlTotal.toFixed(2)}</span>
            <span class="metric">≥1R: ${m.tradesAbove1R}</span>
            <span class="metric">≥1.5R: ${m.tradesAbove1_5R}</span>
            <span class="metric">≥2R: ${m.tradesAbove2R}</span>
          </div>
          
          <div class="block-extremes">
            <span>Mejor: Trade #${m.bestTrade.tradeNumber} (+${m.bestTrade.rPlanned.toFixed(2)}R)</span>
            <span>Peor: Trade #${m.worstTrade.tradeNumber} (${m.worstTrade.rPlanned.toFixed(2)}R)</span>
          </div>
        </div>
        
        ${isExpanded ? this.renderBlockDetails(block) : ''}
      </div>
    `;
  }
  
  renderBlockDetails(block) {
    return `
      <div class="block-details">
        <h4>📋 DETALLE DE TRADES:</h4>
        
        <table class="block-trades-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Símbolo</th>
              <th>Tipo</th>
              <th>Entry→Exit</th>
              <th>Riesgo</th>
              <th>Resultado</th>
              <th>R</th>
              <th>Ítem</th>
            </tr>
          </thead>
          <tbody>
            ${block.trades.map(trade => `
              <tr class="${trade.result >= 0 ? 'winner' : 'loser'}">
                <td>${trade.tradeNumber}</td>
                <td>${formatDate(trade.openTimeBRT)}</td>
                <td>${trade.symbol}${trade.isGrouped ? ' 🔗' : ''}</td>
                <td>${trade.type}</td>
                <td>${trade.entry.toFixed(2)}→${trade.exitPrice.toFixed(2)}</td>
                <td>$${trade.riskPlanned}</td>
                <td class="${trade.result >= 0 ? 'positive' : 'negative'}">${trade.result >= 0 ? '+' : ''}$${trade.result.toFixed(2)}</td>
                <td>${trade.rPlanned.toFixed(2)}R</td>
                <td>${trade.item || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="block-distribution">
          <h4>📊 DISTRIBUCIÓN DE R:</h4>
          ${this.renderRDistribution(block.metrics)}
        </div>
        
        <div class="block-items">
          <h4>🏷️ ÍTEMS MÁS COMUNES:</h4>
          ${this.renderItemAnalysis(block.trades)}
        </div>
      </div>
    `;
  }
  
  renderRDistribution(metrics) {
    const total = metrics.totalTrades;
    const above2R = metrics.tradesAbove2R;
    const above1_5R = metrics.tradesAbove1_5R - above2R;
    const above1R = metrics.tradesAbove1R - metrics.tradesAbove1_5R;
    const below1R = total - metrics.tradesAbove1R;
    
    return `
      <div class="r-distribution">
        <div class="r-bar">
          <div class="r-segment r-2" style="width: ${(above2R / total) * 100}%">
            ≥2R: ${above2R} (${((above2R / total) * 100).toFixed(0)}%)
          </div>
          <div class="r-segment r-1_5" style="width: ${(above1_5R / total) * 100}%">
            ≥1.5R: ${above1_5R} (${((above1_5R / total) * 100).toFixed(0)}%)
          </div>
          <div class="r-segment r-1" style="width: ${(above1R / total) * 100}%">
            ≥1R: ${above1R} (${((above1R / total) * 100).toFixed(0)}%)
          </div>
          <div class="r-segment r-below" style="width: ${(below1R / total) * 100}%">
            <1R: ${below1R} (${((below1R / total) * 100).toFixed(0)}%)
          </div>
        </div>
      </div>
    `;
  }
  
  renderItemAnalysis(trades) {
    const itemCounts = {};
    const itemWins = {};
    
    trades.forEach(trade => {
      if (trade.item) {
        itemCounts[trade.item] = (itemCounts[trade.item] || 0) + 1;
        if (trade.result > 0) {
          itemWins[trade.item] = (itemWins[trade.item] || 0) + 1;
        }
      }
    });
    
    const sortedItems = Object.keys(itemCounts)
      .sort((a, b) => itemCounts[b] - itemCounts[a])
      .slice(0, 5);
    
    if (sortedItems.length === 0) {
      return '<p>No hay ítems registrados en este bloque</p>';
    }
    
    return `
      <ul class="item-list">
        ${sortedItems.map(item => {
          const count = itemCounts[item];
          const wins = itemWins[item] || 0;
          const winRate = (wins / count) * 100;
          return `
            <li>
              <span class="item-name">${item}</span>: 
              ${count} trades (Win%: ${winRate.toFixed(0)}%)
              ${winRate >= 70 ? ' ✅' : winRate < 40 ? ' ⚠️' : ''}
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }
  
  renderBlockChart() {
    // Gráfico de R Promedio por bloque
    const data = this.blocks.map(b => ({
      block: `B${b.number}`,
      rAverage: b.metrics.rAverage,
      pnl: b.metrics.pnlTotal
    }));
    
    return `
      <div class="block-chart">
        <h3>📊 GRÁFICO: R Promedio por Bloque</h3>
        <div id="block-chart-container"></div>
      </div>
    `;
  }
  
  renderInsights() {
    const trend = this.calculateTrend();
    const bestBlock = this.blocks.reduce((best, b) => 
      b.metrics.rAverage > best.metrics.rAverage ? b : best, this.blocks[0]
    );
    const worstBlock = this.blocks.reduce((worst, b) => 
      b.metrics.rAverage < worst.metrics.rAverage ? b : worst, this.blocks[0]
    );
    
    return `
      <div class="block-insights">
        <h3>💡 Insights</h3>
        <ul>
          <li>Tendencia: ${trend.direction === 'up' ? '▲ Mejorando' : trend.direction === 'down' ? '▼ Decayendo' : '➡️ Estable'} (${trend.description})</li>
          <li>Mejor bloque: Bloque ${bestBlock.number} (${bestBlock.metrics.rAverage.toFixed(2)}R promedio, ${bestBlock.metrics.winRate.toFixed(0)}% win)</li>
          <li>Bloque a mejorar: Bloque ${worstBlock.number} (${worstBlock.metrics.rAverage.toFixed(2)}R promedio)</li>
        </ul>
      </div>
    `;
  }
  
  calculateTrend() {
    if (this.blocks.length < 2) return { direction: 'neutral', description: 'Datos insuficientes' };
    
    const recent = this.blocks.slice(-3);
    const rValues = recent.map(b => b.metrics.rAverage);
    
    const isImproving = rValues[rValues.length - 1] > rValues[0];
    const change = rValues[rValues.length - 1] - rValues[0];
    
    if (Math.abs(change) < 0.1) {
      return { direction: 'neutral', description: 'Rendimiento estable' };
    }
    
    return {
      direction: isImproving ? 'up' : 'down',
      description: `${isImproving ? 'Mejora' : 'Disminución'} de ${Math.abs(change).toFixed(2)}R`
    };
  }
  
  attachEventListeners() {
    document.querySelectorAll('.block-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.block-header')) {
          const blockNum = parseInt(card.dataset.block);
          this.toggleBlock(blockNum);
        }
      });
    });
  }
  
  toggleBlock(blockNum) {
    if (this.expandedBlocks.has(blockNum)) {
      this.expandedBlocks.delete(blockNum);
    } else {
      this.expandedBlocks.add(blockNum);
    }
    this.render();
  }
}
```

---

### 5.4 VISTA 3: PROGRESO CONTINUO

#### 5.4.1 Propósito
Vista global del performance acumulado con equity curve, métricas generales y crecimiento de cuenta.
```javascript
class ContinuousProgress {
  constructor(containerEl, trades, config) {
    this.container = containerEl;
    this.trades = trades;
    this.config = config;
    this.metrics = this.calculateGlobalMetrics(trades);
  }
  
  calculateGlobalMetrics(trades) {
    const winners = trades.filter(t => t.result > 0);
    const losers = trades.filter(t => t.result <= 0);
    
    const winRate = (winners.length / trades.length) * 100;
    const rAverage = trades.reduce((sum, t) => sum + t.rPlanned, 0) / trades.length;
    const pnlTotal = trades.reduce((sum, t) => sum + t.result, 0);
    
    const bestTrade = trades.reduce((best, t) => t.rPlanned > best.rPlanned ? t : best, trades[0]);
    const worstTrade = trades.reduce((worst, t) => t.rPlanned < worst.rPlanned ? t : worst, trades[0]);
    
    // Rachas
    const currentStreak = this.getCurrentStreak(trades);
    const maxWinStreak = this.getMaxStreak(trades, true);
    const maxLossStreak = this.getMaxStreak(trades, false);
    
    // Drawdown
    const drawdown = this.calculateDrawdown(trades);
    
    // Alcance de objetivos
    const tradesAbove1R = trades.filter(t => t.rPlanned >= 1).length;
    const tradesAbove1_5R = trades.filter(t => t.rPlanned >= 1.5).length;
    const tradesAbove2R = trades.filter(t => t.rPlanned >= 2).length;
    
    return {
      totalTrades: trades.length,
      winners: winners.length,
      losers: losers.length,
      winRate,
      rAverage,
      pnlTotal,
      bestTrade,
      worstTrade,
      currentStreak,
      maxWinStreak,
      maxLossStreak,
      drawdownCurrent: drawdown.current,
      drawdownMax: drawdown.max,
      tradesAbove1R,
      tradesAbove1_5R,
      tradesAbove2R
    };
  }
  
  getCurrentStreak(trades) {
    let streak = 0;
    let type = null;
    
    for (let i = trades.length - 1; i >= 0; i--) {
      const isWin = trades[i].result > 0;
      
      if (type === null) {
        type = isWin ? 'win' : 'loss';
        streak = 1;
      } else if ((type === 'win' && isWin) || (type === 'loss' && !isWin)) {
        streak++;
      } else {
        break;
      }
    }
    
    return { count: streak, type };
  }
  
  getMaxStreak(trades, wins) {
    let maxStreak = 0;
    let currentStreak = 0;
    
    trades.forEach(trade => {
      const isTarget = wins ? trade.result > 0 : trade.result <= 0;
      
      if (isTarget) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }
  
  calculateDrawdown(trades) {
    let peak = 0;
    let currentEquity = 0;
    let maxDrawdown = 0;
    let currentDrawdown = 0;
    
    tradesReintentarMContinuarjavascript    trades.forEach(trade => {
      currentEquity += trade.result;
      
      if (currentEquity > peak) {
        peak = currentEquity;
      }
      
      currentDrawdown = ((peak - currentEquity) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
    });
    
    return {
      current: currentDrawdown,
      max: maxDrawdown
    };
  }
  
  render() {
    this.container.innerHTML = `
      <div class="continuous-progress">
        <h2>📈 PROGRESO CONTINUO - Vista Global</h2>
        
        ${this.renderGlobalMetrics()}
        
        ${this.renderEquityCurve()}
        
        ${this.renderRDistributionChart()}
        
        ${this.renderObjectivesProgress()}
        
        ${this.renderAccountGrowth()}
        
        ${this.renderDrawdownAnalysis()}
      </div>
    `;
    
    this.attachCharts();
  }
  
  renderGlobalMetrics() {
    const m = this.metrics;
    
    return `
      <div class="global-metrics">
        <h3>📊 MÉTRICAS GENERALES</h3>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">Total Trades</div>
            <div class="metric-value">${m.totalTrades}</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">% Acierto</div>
            <div class="metric-value ${m.winRate >= 60 ? 'positive' : 'negative'}">${m.winRate.toFixed(1)}%</div>
            <div class="metric-detail">${m.winners}W / ${m.losers}L</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">R Promedio</div>
            <div class="metric-value ${m.rAverage >= 0.80 ? 'positive' : 'warning'}">${m.rAverage.toFixed(2)}R</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">P&L Total</div>
            <div class="metric-value ${m.pnlTotal >= 0 ? 'positive' : 'negative'}">
              ${m.pnlTotal >= 0 ? '+' : ''}$${m.pnlTotal.toFixed(2)}
            </div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">Mejor Trade</div>
            <div class="metric-value positive">+${m.bestTrade.rPlanned.toFixed(2)}R</div>
            <div class="metric-detail">Trade #${m.bestTrade.tradeNumber}</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">Peor Trade</div>
            <div class="metric-value negative">${m.worstTrade.rPlanned.toFixed(2)}R</div>
            <div class="metric-detail">Trade #${m.worstTrade.tradeNumber}</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">Racha Ganadora</div>
            <div class="metric-value">${m.currentStreak.type === 'win' ? m.currentStreak.count : 0}</div>
            <div class="metric-detail">Máxima: ${m.maxWinStreak}</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">Racha Perdedora</div>
            <div class="metric-value">${m.currentStreak.type === 'loss' ? m.currentStreak.count : 0}</div>
            <div class="metric-detail">Máxima: ${m.maxLossStreak}</div>
          </div>
        </div>
      </div>
    `;
  }
  
  renderEquityCurve() {
    return `
      <div class="equity-curve-section">
        <h3>💰 EQUITY CURVE (Acumulado)</h3>
        <div id="equity-curve-chart" class="chart-container"></div>
        
        <div class="equity-stats">
          <p>Capital acumulado: $${(this.config.capitalInicial + this.metrics.pnlTotal).toFixed(2)}</p>
          <p>Retorno: ${((this.metrics.pnlTotal / this.config.capitalInicial) * 100).toFixed(2)}%</p>
        </div>
      </div>
    `;
  }
  
  renderRDistributionChart() {
    return `
      <div class="r-distribution-section">
        <h3>📊 DISTRIBUCIÓN DE R (Todos los trades)</h3>
        <div id="r-distribution-chart" class="chart-container"></div>
      </div>
    `;
  }
  
  renderObjectivesProgress() {
    const obj = this.config.objectives;
    const m = this.metrics;
    
    const winRateProgress = Math.min((m.winRate / obj.winRate) * 100, 100);
    const rAvgProgress = Math.min((m.rAverage / obj.rAverage) * 100, 100);
    const trades1_5RProgress = Math.min(((m.tradesAbove1_5R / m.totalTrades * 100) / obj.trades1_5R) * 100, 100);
    const trades1RProgress = Math.min(((m.tradesAbove1R / m.totalTrades * 100) / 50) * 100, 100); // Asumiendo 50% como bueno
    
    return `
      <div class="objectives-progress">
        <h3>🎯 ALCANCE DE OBJETIVOS</h3>
        
        <div class="objective-item">
          <div class="objective-header">
            <span>Trades ≥2R</span>
            <span class="${m.tradesAbove2R >= obj.trades2R * m.totalTrades / 100 ? 'achieved' : 'pending'}">
              ${m.tradesAbove2R} trades (${((m.tradesAbove2R / m.totalTrades) * 100).toFixed(1)}%)
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(((m.tradesAbove2R / m.totalTrades * 100) / obj.trades2R) * 100, 100)}%"></div>
          </div>
          <div class="objective-target">Objetivo: ${obj.trades2R}%</div>
        </div>
        
        <div class="objective-item">
          <div class="objective-header">
            <span>Trades ≥1.5R</span>
            <span class="${m.tradesAbove1_5R >= obj.trades1_5R * m.totalTrades / 100 ? 'achieved' : 'pending'}">
              ${m.tradesAbove1_5R} trades (${((m.tradesAbove1_5R / m.totalTrades) * 100).toFixed(1)}%)
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${trades1_5RProgress}%"></div>
          </div>
          <div class="objective-target">Objetivo: ${obj.trades1_5R}%</div>
        </div>
        
        <div class="objective-item">
          <div class="objective-header">
            <span>Trades ≥1R</span>
            <span class="${m.tradesAbove1R >= m.totalTrades * 0.5 ? 'achieved' : 'pending'}">
              ${m.tradesAbove1R} trades (${((m.tradesAbove1R / m.totalTrades) * 100).toFixed(1)}%)
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${trades1RProgress}%"></div>
          </div>
          <div class="objective-target">Por encima del 50% ✅</div>
        </div>
      </div>
    `;
  }
  
  renderAccountGrowth() {
    const currentCapital = this.config.capitalInicial + this.metrics.pnlTotal;
    const monthlyGrowthTarget = this.config.objectives.monthlyGrowth;
    const currentMonth = this.getCurrentMonthTrades();
    
    const monthlyPnL = currentMonth.reduce((sum, t) => sum + t.result, 0);
    const monthlyTarget = this.config.capitalInicial * (monthlyGrowthTarget / 100);
    const monthlyProgress = Math.min((monthlyPnL / monthlyTarget) * 100, 150);
    
    return `
      <div class="account-growth">
        <h3>💰 CRECIMIENTO DE CUENTA - ${this.getCurrentMonthName()}</h3>
        
        <div class="growth-summary">
          <div class="growth-card">
            <div class="label">Capital Inicial</div>
            <div class="value">$${this.config.capitalInicial.toFixed(2)}</div>
          </div>
          
          <div class="growth-card">
            <div class="label">Capital Actual</div>
            <div class="value positive">$${currentCapital.toFixed(2)}</div>
            <div class="detail">${monthlyPnL >= 0 ? '+' : ''}$${monthlyPnL.toFixed(2)} (${((monthlyPnL / this.config.capitalInicial) * 100).toFixed(2)}%)</div>
          </div>
        </div>
        
        <div class="objective-item">
          <div class="objective-header">
            <span>Meta mensual: +${monthlyGrowthTarget}% ($${monthlyTarget.toFixed(2)})</span>
            <span class="${monthlyPnL >= monthlyTarget ? 'achieved' : 'pending'}">
              Progreso: ${((monthlyPnL / monthlyTarget) * 100).toFixed(1)}%
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${monthlyPnL >= monthlyTarget ? 'success' : ''}" style="width: ${monthlyProgress}%"></div>
          </div>
          <div class="objective-detail">
            ${monthlyPnL >= monthlyTarget 
              ? `✅ ¡Objetivo superado en $${(monthlyPnL - monthlyTarget).toFixed(2)}!` 
              : `Falta: $${(monthlyTarget - monthlyPnL).toFixed(2)}`}
          </div>
        </div>
        
        ${this.renderProjections(currentCapital, monthlyGrowthTarget)}
      </div>
    `;
  }
  
  renderProjections(currentCapital, monthlyGrowth) {
    const projections = [
      { months: 3, capital: currentCapital * Math.pow(1 + monthlyGrowth/100, 3) },
      { months: 6, capital: currentCapital * Math.pow(1 + monthlyGrowth/100, 6) },
      { months: 12, capital: currentCapital * Math.pow(1 + monthlyGrowth/100, 12) }
    ];
    
    return `
      <div class="projections">
        <h4>📈 Proyección (si mantienes ${monthlyGrowth}% mensual):</h4>
        <ul>
          ${projections.map(p => `
            <li>En ${p.months} meses: $${p.capital.toFixed(2)} (+${((p.capital - this.config.capitalInicial) / this.config.capitalInicial * 100).toFixed(1)}%)</li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  renderDrawdownAnalysis() {
    const m = this.metrics;
    const threshold = this.config.objectives.drawdownMax;
    
    return `
      <div class="drawdown-section">
        <h3>📉 DRAWDOWN</h3>
        
        <div class="drawdown-cards">
          <div class="metric-card ${m.drawdownCurrent > threshold ? 'danger' : ''}">
            <div class="metric-label">Drawdown Actual</div>
            <div class="metric-value">${m.drawdownCurrent.toFixed(2)}%</div>
            <div class="metric-detail">Límite: ${threshold}%</div>
          </div>
          
          <div class="metric-card">
            <div class="metric-label">Drawdown Máximo</div>
            <div class="metric-value">${m.drawdownMax.toFixed(2)}%</div>
            <div class="metric-detail">${m.drawdownMax > threshold ? '⚠️ Superó límite' : '✅ Bajo control'}</div>
          </div>
        </div>
        
        ${m.drawdownCurrent > threshold ? `
          <div class="alert alert-warning">
            ⚠️ Tu drawdown actual (${m.drawdownCurrent.toFixed(1)}%) supera el límite configurado (${threshold}%).
            Considera reducir tamaño de posición o tomar un descanso.
          </div>
        ` : ''}
      </div>
    `;
  }
  
  getCurrentMonthTrades() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return this.trades.filter(t => {
      const tradeDate = new Date(t.openTimeBRT);
      return tradeDate.getMonth() === currentMonth && tradeDate.getFullYear() === currentYear;
    });
  }
  
  getCurrentMonthName() {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[new Date().getMonth()]} ${new Date().getFullYear()}`;
  }
  
  attachCharts() {
    this.renderEquityCurveChart();
    this.renderRDistChart();
  }
  
  renderEquityCurveChart() {
    const data = [];
    let cumulative = 0;
    
    this.trades.forEach(trade => {
      cumulative += trade.result;
      data.push({
        trade: trade.tradeNumber,
        equity: cumulative
      });
    });
    
    // Usar Recharts para renderizar
    const chart = `
      <LineChart width={800} height={300} data={${JSON.stringify(data)}}>
        <XAxis dataKey="trade" label="Trade Number" />
        <YAxis label="P&L Acumulado ($)" />
        <Tooltip />
        <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} />
      </LineChart>
    `;
    
    // Renderizar en el contenedor
    document.getElementById('equity-curve-chart').innerHTML = chart;
  }
  
  renderRDistChart() {
    const data = this.trades.map(trade => ({
      trade: trade.tradeNumber,
      r: trade.rPlanned,
      color: trade.rPlanned >= 1 ? '#10b981' : '#ef4444'
    }));
    
    // Scatter plot con Recharts
    const chart = `
      <ScatterChart width={800} height={300} data={${JSON.stringify(data)}}>
        <XAxis dataKey="trade" label="Trade Number" />
        <YAxis label="R Ganado" />
        <Tooltip />
        <Scatter dataKey="r" fill="#8884d8" />
        <ReferenceLine y={0} stroke="#666" />
        <ReferenceLine y={1} stroke="#10b981" strokeDasharray="3 3" />
        <ReferenceLine y={1.5} stroke="#3b82f6" strokeDasharray="3 3" />
      </ScatterChart>
    `;
    
    document.getElementById('r-distribution-chart').innerHTML = chart;
  }
}

5.5 VISTA 4: ANÁLISIS TEMPORAL (Semanal/Mensual)
javascriptclass TemporalAnalysis {
  constructor(containerEl, trades, config) {
    this.container = containerEl;
    this.trades = trades;
    this.config = config;
    this.viewMode = 'monthly'; // 'weekly' o 'monthly'
  }
  
  render() {
    this.container.innerHTML = `
      <div class="temporal-analysis">
        <h2>📅 ANÁLISIS TEMPORAL</h2>
        
        ${this.renderViewSelector()}
        
        ${this.viewMode === 'weekly' ? this.renderWeeklyAnalysis() : this.renderMonthlyAnalysis()}
        
        ${this.renderBestWorstDays()}
        
        ${this.renderHourAnalysis()}
        
        ${this.renderHeatMap()}
        
        ${this.renderWinRateBreakdown()}
      </div>
    `;
    
    this.attachEventListeners();
  }
  
  renderViewSelector() {
    return `
      <div class="view-selector">
        <button class="view-btn ${this.viewMode === 'weekly' ? 'active' : ''}" data-view="weekly">📅 Semanal</button>
        <button class="view-btn ${this.viewMode === 'monthly' ? 'active' : ''}" data-view="monthly">📊 Mensual</button>
      </div>
    `;
  }
  
  renderMonthlyAnalysis() {
    const monthData = this.groupByMonth(this.trades);
    
    return `
      <div class="monthly-analysis">
        <h3>📊 ANÁLISIS MENSUAL - ${this.getCurrentMonthName()}</h3>
        
        ${this.renderMonthSummary(monthData.current)}
        
        ${this.renderWeeklyProgression(monthData.current)}
      </div>
    `;
  }
  
  renderMonthSummary(monthTrades) {
    const metrics = this.calculatePeriodMetrics(monthTrades);
    
    return `
      <div class="month-summary">
        <h4>📈 RESUMEN DEL MES</h4>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="label">Total Trades</span>
            <span class="value">${metrics.totalTrades}</span>
          </div>
          
          <div class="metric-card">
            <span class="label">Win%</span>
            <span class="value ${metrics.winRate >= 60 ? 'positive' : 'negative'}">${metrics.winRate.toFixed(0)}%</span>
          </div>
          
          <div class="metric-card">
            <span class="label">R Promedio</span>
            <span class="value">${metrics.rAverage.toFixed(2)}R</span>
          </div>
          
          <div class="metric-card">
            <span class="label">P&L Total</span>
            <span class="value ${metrics.pnlTotal >= 0 ? 'positive' : 'negative'}">
              ${metrics.pnlTotal >= 0 ? '+' : ''}$${metrics.pnlTotal.toFixed(2)}
            </span>
          </div>
          
          <div class="metric-card">
            <span class="label">Días operados</span>
            <span class="value">${metrics.uniqueDays}</span>
          </div>
          
          <div class="metric-card">
            <span class="label">Trades/día</span>
            <span class="value">${metrics.tradesPerDay.toFixed(1)}</span>
          </div>
          
          <div class="metric-card">
            <span class="label">Mejor racha</span>
            <span class="value">${metrics.maxWinStreak}W</span>
          </div>
          
          <div class="metric-card">
            <span class="label">Peor racha</span>
            <span class="value">${metrics.maxLossStreak}L</span>
          </div>
        </div>
      </div>
    `;
  }
  
  renderWeeklyProgression(monthTrades) {
    const weeks = this.groupByWeek(monthTrades);
    
    return `
      <div class="weekly-progression">
        <h4>📅 PROGRESIÓN SEMANAL</h4>
        
        <table class="weekly-table">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>R Avg</th>
              <th>P&L</th>
              <th>Tendencia</th>
            </tr>
          </thead>
          <tbody>
            ${weeks.map((week, idx) => {
              const metrics = this.calculatePeriodMetrics(week.trades);
              return `
                <tr>
                  <td>Semana ${idx + 1}</td>
                  <td>${metrics.totalTrades}</td>
                  <td>${metrics.winRate.toFixed(0)}%</td>
                  <td>${metrics.rAverage.toFixed(2)}R</td>
                  <td class="${metrics.pnlTotal >= 0 ? 'positive' : 'negative'}">
                    ${metrics.pnlTotal >= 0 ? '+' : ''}$${metrics.pnlTotal.toFixed(2)}
                  </td>
                  <td>${this.getTrendIcon(weeks, idx)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  renderBestWorstDays() {
    const dayMetrics = this.groupByDay(this.trades);
    const sortedDays = Object.values(dayMetrics).sort((a, b) => b.pnl - a.pnl);
    
    const best3 = sortedDays.slice(0, 3);
    const worst3 = sortedDays.slice(-3).reverse();
    
    return `
      <div class="best-worst-days">
        <h3>⭐ MEJORES Y PEORES DÍAS</h3>
        
        <div class="days-grid">
          <div class="days-section">
            <h4>🏆 Top 3 Mejores Días</h4>
            ${best3.map((day, idx) => `
              <div class="day-card best">
                <div class="day-rank">${idx + 1}</div>
                <div class="day-info">
                  <div class="day-date">${formatDate(day.date)}</div>
                  <div class="day-stats">
                    <span class="positive">+$${day.pnl.toFixed(2)}</span>
                    <span>${day.trades.length} trades, ${((day.winners / day.trades.length) * 100).toFixed(0)}% win</span>
                    <span>R: ${day.rAverage.toFixed(2)}R avg</span>
                  </div>
                  ${day.dominantItem ? `<div class="day-item">🏷️ ${day.dominantItem}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="days-section">
            <h4>💀 Top 3 Peores Días</h4>
            ${worst3.map((day, idx) => `
              <div class="day-card worst">
                <div class="day-rank">${idx + 1}</div>
                <div class="day-info">
                  <div class="day-date">${formatDate(day.date)}</div>
                  <div class="day-stats">
                    <span class="negative">-$${Math.abs(day.pnl).toFixed(2)}</span>
                    <span>${day.trades.length} trades, ${((day.winners / day.trades.length) * 100).toFixed(0)}% win</span>
                    <span>R: ${day.rAverage.toFixed(2)}R avg</span>
                  </div>
                  ${day.dominantItem ? `<div class="day-item">⚠️ ${day.dominantItem}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }
  
  renderHourAnalysis() {
    const hourMetrics = this.groupByHourRange(this.trades);
    
    return `
      <div class="hour-analysis">
        <h3>⏰ ANÁLISIS POR FRANJA HORARIA (BRT)</h3>
        
        <table class="hour-table">
          <thead>
            <tr>
              <th>Franja</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>R Avg</th>
              <th>P&L</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            ${hourMetrics.map(range => {
              const rating = this.getRating(range.winRate, range.rAverage);
              return `
                <tr class="${rating.class}">
                  <td>${range.label}</td>
                  <td>${range.totalTrades}</td>
                  <td>${range.winRate.toFixed(0)}%</td>
                  <td>${range.rAverage.toFixed(2)}R</td>
                  <td class="${range.pnlTotal >= 0 ? 'positive' : 'negative'}">
                    ${range.pnlTotal >= 0 ? '+' : ''}$${range.pnlTotal.toFixed(2)}
                  </td>
                  <td>${rating.stars} ${rating.label}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        ${this.renderHourInsights(hourMetrics)}
      </div>
    `;
  }
  
  renderHourInsights(hourMetrics) {
    const bestHour = hourMetrics.reduce((best, h) => h.rAverage > best.rAverage ? h : best, hourMetrics[0]);
    const worstHour = hourMetrics.reduce((worst, h) => h.rAverage < worst.rAverage ? h : worst, hourMetrics[0]);
    
    return `
      <div class="hour-insights">
        <p>💡 Mejor franja: <strong>${bestHour.label}</strong> (${bestHour.winRate.toFixed(0)}% win, ${bestHour.rAverage.toFixed(2)}R)</p>
        <p>⚠️ Evitar: <strong>${worstHour.label}</strong> (${worstHour.winRate.toFixed(0)}% win, ${worstHour.rAverage.toFixed(2)}R)</p>
      </div>
    `;
  }
  
  renderHeatMap() {
    const heatmapData = this.generateHeatMapData();
    
    return `
      <div class="heatmap-section">
        <h3>🔥 HEAT MAP - Mejor rendimiento por Día y Hora</h3>
        <p class="heatmap-subtitle">(Basado en hora de apertura BRT)</p>
        
        <table class="heatmap-table">
          <thead>
            <tr>
              <th></th>
              ${this.config.hourRanges.map(r => `<th>${r.start}-${r.end}h</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map(day => `
              <tr>
                <td class="day-label">${day}</td>
                ${this.config.hourRanges.map(range => {
                  const cell = heatmapData[day]?.[`${range.start}-${range.end}`];
                  return `<td class="heatmap-cell ${this.getHeatClass(cell)}">${cell ? cell.emoji : '-'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="heatmap-legend">
          <span>🟢🟢 Excelente (Win% ≥75%)</span>
          <span>🟢 Bueno (Win% ≥60%)</span>
          <span>🟡 Regular (Win% ≥45%)</span>
          <span>🔴 Malo (Win% <45%)</span>
        </div>
        
        ${this.renderHeatMapInsights(heatmapData)}
      </div>
    `;
  }
  
  renderHeatMapInsights(heatmapData) {
    const bestSlots = this.findBestHeatmapSlots(heatmapData);
    
    return `
      <div class="heatmap-insights">
        <p>💡 Insight: Tus mejores ventanas de trading son:</p>
        <ul>
          ${bestSlots.map(slot => `
            <li><strong>${slot.day} ${slot.hour}</strong> (${slot.winRate.toFixed(0)}% win, ${slot.trades} trades)</li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  renderWinRateBreakdown() {
    const symbolMetrics = this.groupBySymbol(this.trades);
    const directionMetrics = this.groupByDirection(this.trades);
    const crossMetrics = this.groupBySymbolDirection(this.trades);
    
    return `
      <div class="winrate-breakdown">
        <h3>📊 WIN RATE POR SÍMBOLO</h3>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th>Símbolo</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>R Avg</th>
              <th>P&L</th>
              <th>Mejor Setup</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(symbolMetrics).map(s => `
              <tr>
                <td>${s.symbol}</td>
                <td>${s.totalTrades}</td>
                <td>${s.winRate.toFixed(0)}%</td>
                <td>${s.rAverage.toFixed(2)}R</td>
                <td class="${s.pnReintentarMcontinúajavascript                <td class="${s.pnlTotal >= 0 ? 'positive' : 'negative'}">
                  ${s.pnlTotal >= 0 ? '+' : ''}$${s.pnlTotal.toFixed(2)}
                </td>
                <td>${s.bestSetup || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <h3>📊 WIN RATE POR DIRECCIÓN</h3>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th>Dirección</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>R Avg</th>
              <th>P&L</th>
              <th>Análisis</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(directionMetrics).map(d => `
              <tr>
                <td>${d.type}</td>
                <td>${d.totalTrades}</td>
                <td class="${d.winRate >= 60 ? 'positive' : 'warning'}">${d.winRate.toFixed(0)}%</td>
                <td>${d.rAverage.toFixed(2)}R</td>
                <td class="${d.pnlTotal >= 0 ? 'positive' : 'negative'}">
                  ${d.pnlTotal >= 0 ? '+' : ''}$${d.pnlTotal.toFixed(2)}
                </td>
                <td>${this.getDirectionAnalysis(d)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <h3>📊 WIN RATE POR PAR + DIRECCIÓN (Cruce)</h3>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th>Par + Dirección</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>R Avg</th>
              <th>P&L</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(crossMetrics).map(c => {
              const rating = this.getRating(c.winRate, c.rAverage);
              return `
                <tr>
                  <td><strong>${c.symbol} ${c.type}</strong></td>
                  <td>${c.totalTrades}</td>
                  <td>${c.winRate.toFixed(0)}%</td>
                  <td>${c.rAverage.toFixed(2)}R</td>
                  <td class="${c.pnlTotal >= 0 ? 'positive' : 'negative'}">
                    ${c.pnlTotal >= 0 ? '+' : ''}$${c.pnlTotal.toFixed(2)}
                  </td>
                  <td>${rating.stars} ${this.getCrossInsight(c)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        ${this.renderCrossInsights(crossMetrics)}
      </div>
    `;
  }
  
  renderCrossInsights(crossMetrics) {
    const sorted = Object.values(crossMetrics).sort((a, b) => b.rAverage - a.rAverage);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    
    return `
      <div class="cross-insights">
        <h4>💡 Insights clave:</h4>
        <ul>
          <li><strong>${best.symbol} ${best.type}</strong>: Tu EDGE más fuerte (${best.winRate.toFixed(0)}% win, ${best.rAverage.toFixed(2)}R avg) ⭐</li>
          ${worst.winRate < 45 ? `
            <li><strong>${worst.symbol} ${worst.type}</strong>: Evitar o mejorar gestión (${worst.winRate.toFixed(0)}% win, ${worst.rAverage.toFixed(2)}R avg) ⚠️</li>
          ` : ''}
          <li>Considera enfocarte en tus mejores combinaciones para maximizar consistencia</li>
        </ul>
      </div>
    `;
  }
  
  // Métodos auxiliares
  
  calculatePeriodMetrics(trades) {
    if (trades.length === 0) return this.getEmptyMetrics();
    
    const winners = trades.filter(t => t.result > 0);
    const uniqueDays = new Set(trades.map(t => formatDate(t.openTimeBRT))).size;
    
    return {
      totalTrades: trades.length,
      winners: winners.length,
      losers: trades.length - winners.length,
      winRate: (winners.length / trades.length) * 100,
      rAverage: trades.reduce((sum, t) => sum + t.rPlanned, 0) / trades.length,
      pnlTotal: trades.reduce((sum, t) => sum + t.result, 0),
      uniqueDays,
      tradesPerDay: trades.length / uniqueDays,
      maxWinStreak: this.getMaxStreak(trades, true),
      maxLossStreak: this.getMaxStreak(trades, false)
    };
  }
  
  groupByMonth(trades) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const current = trades.filter(t => {
      const d = new Date(t.openTimeBRT);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    
    return { current };
  }
  
  groupByWeek(trades) {
    const weeks = {};
    
    trades.forEach(trade => {
      const weekNum = getWeekNumber(new Date(trade.openTimeBRT));
      if (!weeks[weekNum]) weeks[weekNum] = [];
      weeks[weekNum].push(trade);
    });
    
    return Object.keys(weeks).sort().map(week => ({
      weekNumber: parseInt(week),
      trades: weeks[week]
    }));
  }
  
  groupByDay(trades) {
    const days = {};
    
    trades.forEach(trade => {
      const date = formatDate(trade.openTimeBRT);
      if (!days[date]) {
        days[date] = {
          date: trade.openTimeBRT,
          trades: [],
          pnl: 0,
          winners: 0
        };
      }
      days[date].trades.push(trade);
      days[date].pnl += trade.result;
      if (trade.result > 0) days[date].winners++;
    });
    
    // Añadir métricas calculadas
    Object.values(days).forEach(day => {
      day.rAverage = day.trades.reduce((sum, t) => sum + t.rPlanned, 0) / day.trades.length;
      day.dominantItem = this.getDominantItem(day.trades);
    });
    
    return days;
  }
  
  groupByHourRange(trades) {
    const ranges = this.config.hourRanges.map(r => ({
      start: r.start,
      end: r.end,
      label: `${r.start}:00-${r.end}:00`,
      trades: []
    }));
    
    trades.forEach(trade => {
      const hour = trade.openHourBRT;
      const range = ranges.find(r => hour >= r.start && hour < r.end);
      if (range) range.trades.push(trade);
    });
    
    return ranges.map(range => ({
      ...range,
      ...this.calculatePeriodMetrics(range.trades)
    }));
  }
  
  groupBySymbol(trades) {
    const symbols = {};
    
    trades.forEach(trade => {
      if (!symbols[trade.symbol]) {
        symbols[trade.symbol] = {
          symbol: trade.symbol,
          trades: []
        };
      }
      symbols[trade.symbol].trades.push(trade);
    });
    
    Object.values(symbols).forEach(s => {
      const metrics = this.calculatePeriodMetrics(s.trades);
      Object.assign(s, metrics);
      s.bestSetup = this.getBestSetup(s.trades);
    });
    
    return symbols;
  }
  
  groupByDirection(trades) {
    const directions = { LONG: [], SHORT: [] };
    
    trades.forEach(trade => {
      directions[trade.type].push(trade);
    });
    
    return {
      LONG: { type: 'LONG', ...this.calculatePeriodMetrics(directions.LONG) },
      SHORT: { type: 'SHORT', ...this.calculatePeriodMetrics(directions.SHORT) }
    };
  }
  
  groupBySymbolDirection(trades) {
    const cross = {};
    
    trades.forEach(trade => {
      const key = `${trade.symbol}_${trade.type}`;
      if (!cross[key]) {
        cross[key] = {
          symbol: trade.symbol,
          type: trade.type,
          trades: []
        };
      }
      cross[key].trades.push(trade);
    });
    
    Object.values(cross).forEach(c => {
      const metrics = this.calculatePeriodMetrics(c.trades);
      Object.assign(c, metrics);
    });
    
    return cross;
  }
  
  generateHeatMapData() {
    const heatmap = {};
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    
    days.forEach(day => {
      heatmap[day] = {};
      this.config.hourRanges.forEach(range => {
        const trades = this.trades.filter(t => {
          const tradeDay = getDayOfWeek(t.openTimeBRT);
          const tradeHour = t.openHourBRT;
          return tradeDay === day && tradeHour >= range.start && tradeHour < range.end;
        });
        
        if (trades.length > 0) {
          const winners = trades.filter(t => t.result > 0);
          const winRate = (winners.length / trades.length) * 100;
          
          heatmap[day][`${range.start}-${range.end}`] = {
            trades: trades.length,
            winRate,
            emoji: this.getHeatEmoji(winRate)
          };
        }
      });
    });
    
    return heatmap;
  }
  
  getHeatEmoji(winRate) {
    if (winRate >= 75) return '🟢🟢';
    if (winRate >= 60) return '🟢';
    if (winRate >= 45) return '🟡';
    return '🔴';
  }
  
  getHeatClass(cell) {
    if (!cell) return 'empty';
    if (cell.winRate >= 75) return 'excellent';
    if (cell.winRate >= 60) return 'good';
    if (cell.winRate >= 45) return 'regular';
    return 'bad';
  }
  
  findBestHeatmapSlots(heatmapData) {
    const slots = [];
    
    Object.keys(heatmapData).forEach(day => {
      Object.keys(heatmapData[day]).forEach(hour => {
        const cell = heatmapData[day][hour];
        if (cell && cell.winRate >= 70) {
          slots.push({
            day,
            hour,
            winRate: cell.winRate,
            trades: cell.trades
          });
        }
      });
    });
    
    return slots.sort((a, b) => b.winRate - a.winRate).slice(0, 3);
  }
  
  getRating(winRate, rAverage) {
    const score = (winRate / 100) + rAverage;
    
    if (score >= 1.8) return { stars: '⭐⭐⭐⭐⭐', label: 'Excelente', class: 'excellent' };
    if (score >= 1.4) return { stars: '⭐⭐⭐⭐', label: 'Muy bueno', class: 'very-good' };
    if (score >= 1.0) return { stars: '⭐⭐⭐', label: 'Bueno', class: 'good' };
    if (score >= 0.7) return { stars: '⭐⭐', label: 'Regular', class: 'regular' };
    return { stars: '⭐', label: 'Mejorar', class: 'poor' };
  }
  
  getDirectionAnalysis(d) {
    if (d.winRate >= 70 && d.rAverage >= 0.9) return '✅ Fortaleza clara';
    if (d.winRate < 50 || d.rAverage < 0.5) return '⚠️ Necesita mejorar gestión';
    return '➡️ Rendimiento aceptable';
  }
  
  getCrossInsight(c) {
    if (c.winRate >= 75 && c.rAverage >= 1.0) return 'Tu mejor combinación';
    if (c.winRate < 45 || c.rAverage < 0.3) return 'Evitar o mejorar';
    return 'Rendimiento aceptable';
  }
  
  getDominantItem(trades) {
    const items = {};
    trades.forEach(t => {
      if (t.item) items[t.item] = (items[t.item] || 0) + 1;
    });
    
    const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }
  
  getBestSetup(trades) {
    const items = {};
    
    trades.forEach(t => {
      if (t.item) {
        if (!items[t.item]) items[t.item] = { count: 0, wins: 0 };
        items[t.item].count++;
        if (t.result > 0) items[t.item].wins++;
      }
    });
    
    const sorted = Object.entries(items)
      .map(([item, data]) => ({ item, winRate: (data.wins / data.count) * 100 }))
      .sort((a, b) => b.winRate - a.winRate);
    
    return sorted.length > 0 ? `${sorted[0].item} (${sorted[0].winRate.toFixed(0)}%)` : '-';
  }
  
  getTrendIcon(weeks, currentIndex) {
    if (currentIndex === 0) return '➡️';
    
    const current = this.calculatePeriodMetrics(weeks[currentIndex].trades);
    const previous = this.calculatePeriodMetrics(weeks[currentIndex - 1].trades);
    
    if (current.rAverage > previous.rAverage) return '▲ Mejorando';
    if (current.rAverage < previous.rAverage) return '▼ Retroceso';
    return '➡️ Estable';
  }
  
  getMaxStreak(trades, wins) {
    let maxStreak = 0;
    let currentStreak = 0;
    
    trades.forEach(trade => {
      const isTarget = wins ? trade.result > 0 : trade.result <= 0;
      if (isTarget) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }
  
  getEmptyMetrics() {
    return {
      totalTrades: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      rAverage: 0,
      pnlTotal: 0,
      uniqueDays: 0,
      tradesPerDay: 0,
      maxWinStreak: 0,
      maxLossStreak: 0
    };
  }
  
  attachEventListeners() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.viewMode = e.target.dataset.view;
        this.render();
      });
    });
  }
}

5.6 VISTA 5: EXPECTED VALUE (EV)
javascriptclass ExpectedValueAnalysis {
  constructor(containerEl, trades, config) {
    this.container = containerEl;
    this.trades = trades;
    this.config = config;
    this.ev = this.calculateEV(trades);
  }
  
  calculateEV(trades) {
    if (trades.length === 0) return this.getEmptyEV();
    
    const winners = trades.filter(t => t.result > 0);
    const losers = trades.filter(t => t.result <= 0);
    
    const winRate = winners.length / trades.length;
    const lossRate = losers.length / trades.length;
    
    const avgWin = winners.reduce((sum, t) => sum + t.result, 0) / winners.length;
    const avgLoss = Math.abs(losers.reduce((sum, t) => sum + t.result, 0) / losers.length);
    
    const evDollar = (winRate * avgWin) - (lossRate * avgLoss);
    
    const avgRisk = trades.reduce((sum, t) => sum + t.riskPlanned, 0) / trades.length;
    const evR = evDollar / avgRisk;
    
    return {
      winRate: winRate * 100,
      lossRate: lossRate * 100,
      avgWin,
      avgLoss,
      evDollar,
      evR,
      totalTrades: trades.length,
      avgRisk
    };
  }
  
  render() {
    this.container.innerHTML = `
      <div class="ev-analysis">
        <h2>💰 EXPECTED VALUE (EV) - Análisis de Rentabilidad a Largo Plazo</h2>
        
        ${this.renderFormula()}
        
        ${this.renderCurrentData()}
        
        ${this.renderCalculation()}
        
        ${this.renderInterpretation()}
        
        ${this.renderEVInR()}
        
        ${this.renderEVBySymbol()}
        
        ${this.renderEVByDirection()}
        
        ${this.renderEVEvolution()}
        
        ${this.renderSimulations()}
      </div>
    `;
  }
  
  renderFormula() {
    return `
      <div class="ev-formula">
        <h3>📐 FÓRMULA</h3>
        <div class="formula-box">
          <code>EV = (Win Rate × Avg Win) – (Loss Rate × Avg Loss)</code>
        </div>
      </div>
    `;
  }
  
  renderCurrentData() {
    const ev = this.ev;
    
    return `
      <div class="ev-data">
        <h3>📊 TUS DATOS (Últimos ${ev.totalTrades} trades)</h3>
        
        <div class="data-grid">
          <div class="data-card">
            <span class="label">Win Rate</span>
            <span class="value">${ev.winRate.toFixed(1)}%</span>
            <span class="detail">${Math.round(ev.winRate * ev.totalTrades / 100)} ganadores / ${ev.totalTrades} trades</span>
          </div>
          
          <div class="data-card">
            <span class="label">Loss Rate</span>
            <span class="value">${ev.lossRate.toFixed(1)}%</span>
            <span class="detail">${Math.round(ev.lossRate * ev.totalTrades / 100)} perdedores / ${ev.totalTrades} trades</span>
          </div>
          
          <div class="data-card">
            <span class="label">Avg Win</span>
            <span class="value positive">$${ev.avgWin.toFixed(2)}</span>
            <span class="detail">Promedio de trades ganadores</span>
          </div>
          
          <div class="data-card">
            <span class="label">Avg Loss</span>
            <span class="value negative">$${ev.avgLoss.toFixed(2)}</span>
            <span class="detail">Promedio de trades perdedores</span>
          </div>
        </div>
      </div>
    `;
  }
  
  renderCalculation() {
    const ev = this.ev;
    const winComponent = (ev.winRate / 100) * ev.avgWin;
    const lossComponent = (ev.lossRate / 100) * ev.avgLoss;
    
    return `
      <div class="ev-calculation">
        <h3>🧮 CÁLCULO</h3>
        
        <div class="calculation-steps">
          <div class="step">
            <span class="step-label">Win Component:</span>
            <span class="step-value">(${(ev.winRate / 100).toFixed(2)} × $${ev.avgWin.toFixed(2)}) = $${winComponent.toFixed(2)}</span>
          </div>
          
          <div class="step">
            <span class="step-label">Loss Component:</span>
            <span class="step-value">(${(ev.lossRate / 100).toFixed(2)} × $${ev.avgLoss.toFixed(2)}) = $${lossComponent.toFixed(2)}</span>
          </div>
          
          <div class="step final">
            <span class="step-label">EV:</span>
            <span class="step-value highlight">$${winComponent.toFixed(2)} – $${lossComponent.toFixed(2)} = <strong>${ev.evDollar >= 0 ? '+' : ''}$${ev.evDollar.toFixed(2)} per trade</strong></span>
          </div>
        </div>
      </div>
    `;
  }
  
  renderInterpretation() {
    const ev = this.ev;
    const isPositive = ev.evDollar > 0;
    
    return `
      <div class="ev-interpretation ${isPositive ? 'positive' : 'negative'}">
        <h3>✅ INTERPRETACIÓN</h3>
        
        <div class="interpretation-box">
          <p class="main-message">
            ${isPositive 
              ? `Si repites este sistema muchas veces, en promedio ganarás <strong>$${ev.evDollar.toFixed(2)}</strong> por trade.`
              : `⚠️ Tu EV es negativo ($${ev.evDollar.toFixed(2)}). Tu estrategia actual pierde dinero a largo plazo.`
            }
          </p>
          
          ${isPositive ? `
            <p class="ev-status">🟢 <strong>EV POSITIVO</strong> → Tu estrategia es rentable a largo plazo</p>
            
            <p class="projection">💡 Con 100 trades más esperarías ganar: 
              <strong>$${ev.evDollar.toFixed(2)} × 100 = $${(ev.evDollar * 100).toFixed(2)}</strong>
            </p>
          ` : `
            <p class="ev-status">🔴 <strong>EV NEGATIVO</strong> → Necesitas ajustar tu estrategia</p>
            
            <p class="warning">Revisa tu gestión de riesgo, tamaño de posición, y selección de setups.</p>
          `}
        </div>
      </div>
    `;
  }
  
  renderEVInR() {
    const ev = this.ev;
    
    return `
      <div class="ev-in-r">
        <h3>📈 EV EN R (Ratio de Riesgo)</h3>
        
        <div class="r-calculation">
          <p><strong>EV en R = EV ($) / Riesgo Promedio</strong></p>
          <p class="result">EV en R = $${ev.evDollar.toFixed(2)} / $${ev.avgRisk.toFixed(2)} = <strong>${ev.evR.toFixed(2)}R per trade</strong></p>
          
          <p class="interpretation">
            💡 Por cada $1 que arriesgas, esperas ${ev.evR >= 0 ? 'ganar' : 'perder'} <strong>$${Math.abs(ev.evR).toFixed(2)}</strong>
          </p>
        </div>
      </div>
    `;
  }
  
  renderEVBySymbol() {
    const symbolEVs = this.calculateEVByCategory('symbol');
    
    return `
      <div class="ev-by-symbol">
        <h3>📊 EV POR SÍMBOLO</h3>
        
        <table class="ev-table">
          <thead>
            <tr>
              <th>Símbolo</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>Avg Win</th>
              <th>Avg Loss</th>
              <th>EV ($)</th>
              <th>EV (R)</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            ${symbolEVs.map(s => `
              <tr class="${s.ev.evDollar >= 0 ? 'positive-ev' : 'negative-ev'}">
                <td><strong>${s.category}</strong></td>
                <td>${s.ev.totalTrades}</td>
                <td>${s.ev.winRate.toFixed(0)}%</td>
                <td>$${s.ev.avgWin.toFixed(2)}</td>
                <td>$${s.ev.avgLoss.toFixed(2)}</td>
                <td class="${s.ev.evDollar >= 0 ? 'positive' : 'negative'}">
                  ${s.ev.evDollar >= 0 ? '+' : ''}$${s.ev.evDollar.toFixed(2)}
                </td>
                <td>${s.ev.evR.toFixed(2)}R</td>
                <td>${this.getEVRating(s.ev.evDollar, s.ev.evR)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${this.renderSymbolInsight(symbolEVs)}
      </div>
    `;
  }
  
  renderEVByDirection() {
    const directionEVs = this.calculateEVByCategory('type');
    
    return `
      <div class="ev-by-direction">
        <h3>📊 EV POR DIRECCIÓN</h3>
        
        <table class="ev-table">
          <thead>
            <tr>
              <th>Dirección</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>Avg Win</th>
              <th>Avg Loss</th>
              <th>EV ($)</th>
              <th>EV (R)</th>
              <th>Análisis</th>
            </tr>
          </thead>
          <tbody>
            ${directionEVs.map(d => `
              <tr class="${d.ev.evDollar >= 0 ? 'positive-ev' : 'negative-ev'}">
                <td><strong>${d.category}</strong></td>
                <td>${d.ev.totalTrades}</td>
                <td>${d.ev.winRate.toFixed(0)}%</td>
                <td>$${d.ev.avgWin.toFixed(2)}</td>
                <td>$${d.ev.avgLoss.toFixed(2)}</td>
                <td class="${d.ev.evDollar >= 0 ? 'positive' : 'negative'}">
                  ${d.ev.evDollar >= 0 ? '+' : ''}$${d.ev.evDollar.toFixed(2)}
                </td>
                <td>${d.ev.evR.toFixed(2)}R</td>
                <td>${this.getDirectionEVAnalysis(d)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${this.renderDirectionInsight(directionEVs)}
      </div>
    `;
  }
  
  renderEVEvolution() {
    const blockEVs = this.calculateEVByBlock();
    
    return `
      <div class="ev-evolution">
        <h3>📈 EVOLUCIÓN DEL EV (Por bloque)</h3>
        
        <div id="ev-evolution-chart" class="chart-container"></div>
        
        <div class="evolution-table">
          <table>
            <thead>
              <tr>
                <th>Bloque</th>
                <th>EV ($)</th>
                <th>EV (R)</th>
                <th>Tendencia</th>
              </tr>
            </thead>
            <tbody>
              ${blockEVs.map((b, idx) => `
                <tr>
                  <td>Bloque ${b.block}</td>
                  <td class="${b.ev.evDollar >= 0 ? 'positive' : 'negative'}">
                    ${b.ev.evDollar >= 0 ? '+' : ''}$${b.ev.evDollar.toFixed(2)}
                  </td>
                  <td>${b.ev.evR.toFixed(2)}R</td>
                  <td>${this.getTrendIndicator(blockEVs, idx)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <p class="evolution-insight">
          ${this.getEvolutionInsight(blockEVs)}
        </p>
      </div>
    `;
  }
  
  renderSimulations() {
    const ev = this.ev;
    const simulations = [
      {
        change: 'Mejoras Win% a 65%',
        newWinRate: 65,
        newAvgWin: ev.avgWin,
        newAvgLoss: ev.avgLoss
      },
      {
        change: 'Mejoras Avg Win a $150',
        newWinRate: ev.winRate,
        newAvgWin: 150,
        newAvgLoss: ev.avgLoss
      },
      {
        change: 'Reduces Avg Loss a $55',
        newWinRate: ev.winRate,
        newAvgWin: ev.avgWin,
        newAvgLoss: 55
      },
      {
        change: 'ReintentarMContinuarjavascript      {
        change: 'Combinas todo lo anterior',
        newWinRate: 65,
        newAvgWin: 150,
        newAvgLoss: 55
      }
    ];
    
    return `
      <div class="ev-simulations">
        <h3>⚠️ ESCENARIOS DE SIMULACIÓN</h3>
        <p class="simulation-intro">¿Qué pasa si...?</p>
        
        <table class="simulation-table">
          <thead>
            <tr>
              <th>Escenario</th>
              <th>Nuevo EV ($)</th>
              <th>Cambio</th>
              <th>Impacto</th>
            </tr>
          </thead>
          <tbody>
            ${simulations.map(sim => {
              const newEV = this.simulateEV(sim.newWinRate, sim.newAvgWin, sim.newAvgLoss);
              const change = newEV - ev.evDollar;
              const changePercent = ((change / Math.abs(ev.evDollar)) * 100);
              
              return `
                <tr>
                  <td>${sim.change}</td>
                  <td class="${newEV >= 0 ? 'positive' : 'negative'}">
                    ${newEV >= 0 ? '+' : ''}$${newEV.toFixed(2)}
                  </td>
                  <td class="${change >= 0 ? 'positive' : 'negative'}">
                    ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(0)}%)
                  </td>
                  <td>${this.getImpactIcon(changePercent)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="simulation-insight">
          <p>💡 ${this.getSimulationRecommendation(simulations, ev)}</p>
        </div>
      </div>
    `;
  }
  
  // Métodos auxiliares
  
  calculateEVByCategory(field) {
    const categories = {};
    
    this.trades.forEach(trade => {
      const category = trade[field];
      if (!categories[category]) categories[category] = [];
      categories[category].push(trade);
    });
    
    return Object.entries(categories)
      .map(([category, trades]) => ({
        category,
        ev: this.calculateEV(trades)
      }))
      .sort((a, b) => b.ev.evDollar - a.ev.evDollar);
  }
  
  calculateEVByBlock() {
    const blocks = {};
    
    this.trades.forEach(trade => {
      if (!blocks[trade.block]) blocks[trade.block] = [];
      blocks[trade.block].push(trade);
    });
    
    return Object.entries(blocks)
      .map(([block, trades]) => ({
        block: parseInt(block),
        ev: this.calculateEV(trades)
      }))
      .sort((a, b) => a.block - b.block);
  }
  
  simulateEV(winRate, avgWin, avgLoss) {
    const wr = winRate / 100;
    const lr = 1 - wr;
    return (wr * avgWin) - (lr * avgLoss);
  }
  
  getEVRating(evDollar, evR) {
    if (evDollar >= 80 && evR >= 0.8) return '⭐⭐⭐⭐⭐ Excelente';
    if (evDollar >= 50 && evR >= 0.5) return '⭐⭐⭐⭐ Muy bueno';
    if (evDollar >= 20 && evR >= 0.2) return '⭐⭐⭐ Bueno';
    if (evDollar >= 0) return '⭐⭐ Positivo';
    return '⭐ Negativo';
  }
  
  getDirectionEVAnalysis(d) {
    if (d.ev.evDollar >= 70) return '✅ Excelente';
    if (d.ev.evDollar >= 30) return '👍 Bueno';
    if (d.ev.evDollar >= 0) return '➡️ Aceptable';
    return '⚠️ Mejorable';
  }
  
  renderSymbolInsight(symbolEVs) {
    const best = symbolEVs[0];
    const worst = symbolEVs[symbolEVs.length - 1];
    
    return `
      <div class="ev-insight">
        <p>💡 <strong>${best.category}</strong> tiene el mejor EV ($${best.ev.evDollar.toFixed(2)}), enfócate ahí</p>
        ${worst.ev.evDollar < 0 ? `
          <p>⚠️ <strong>${worst.category}</strong> tiene EV negativo, considera evitarlo o mejorar tu gestión</p>
        ` : ''}
      </div>
    `;
  }
  
  renderDirectionInsight(directionEVs) {
    const diff = Math.abs(directionEVs[0].ev.evDollar - directionEVs[1].ev.evDollar);
    
    if (diff > 50) {
      return `
        <div class="ev-insight">
          <p>💡 Tu EV en <strong>${directionEVs[0].category}</strong> es significativamente mejor que en <strong>${directionEVs[1].category}</strong>.</p>
          <p>Considera enfocarte en ${directionEVs[0].category} o mejorar gestión en ${directionEVs[1].category}.</p>
        </div>
      `;
    }
    
    return `
      <div class="ev-insight">
        <p>✅ Tu EV es similar en ambas direcciones, lo cual indica versatilidad.</p>
      </div>
    `;
  }
  
  getTrendIndicator(blockEVs, index) {
    if (index === 0) return '▶️';
    
    const current = blockEVs[index].ev.evDollar;
    const previous = blockEVs[index - 1].ev.evDollar;
    
    if (current > previous) return '▲ Mejorando';
    if (current < previous) return '▼ Decayendo';
    return '➡️ Estable';
  }
  
  getEvolutionInsight(blockEVs) {
    if (blockEVs.length < 2) return 'Necesitas más bloques para ver tendencia';
    
    const first = blockEVs[0].ev.evDollar;
    const last = blockEVs[blockEVs.length - 1].ev.evDollar;
    
    if (last > first) {
      return `📈 Tendencia: Mejorando (de $${first.toFixed(2)} a $${last.toFixed(2)})`;
    } else if (last < first) {
      return `📉 Tendencia: Decayendo (de $${first.toFixed(2)} a $${last.toFixed(2)})`;
    }
    return '➡️ Tendencia: Estable';
  }
  
  getImpactIcon(changePercent) {
    if (changePercent >= 50) return '🚀 Alto impacto';
    if (changePercent >= 20) return '📈 Impacto medio';
    if (changePercent >= 5) return '📊 Impacto bajo';
    return '➡️ Impacto mínimo';
  }
  
  getSimulationRecommendation(simulations, currentEV) {
    const results = simulations.map(sim => ({
      ...sim,
      newEV: this.simulateEV(sim.newWinRate, sim.newAvgWin, sim.newAvgLoss),
      improvement: this.simulateEV(sim.newWinRate, sim.newAvgWin, sim.newAvgLoss) - currentEV.evDollar
    }));
    
    const best = results.reduce((best, r) => r.improvement > best.improvement ? r : best, results[0]);
    
    return `El mayor impacto vendría de: <strong>${best.change}</strong> (+$${best.improvement.toFixed(2)} en EV)`;
  }
  
  getEmptyEV() {
    return {
      winRate: 0,
      lossRate: 0,
      avgWin: 0,
      avgLoss: 0,
      evDollar: 0,
      evR: 0,
      totalTrades: 0,
      avgRisk: 0
    };
  }
}

6. MÓDULO 5: SISTEMA DE CONFIGURACIÓN
6.1 Propósito
Permitir al usuario personalizar objetivos, preferencias, franjas horarias y configuración general del sistema.
6.2 Componente de Configuración
javascriptclass ConfigurationManager {
  constructor() {
    this.modal = null;
    this.currentConfig = null;
  }
  
  async open() {
    this.currentConfig = await new StorageManager().getConfig();
    this.render();
    this.modal.style.display = 'block';
    this.attachEventListeners();
  }
  
  render() {
    const config = this.currentConfig;
    
    const modalHTML = `
      <div id="config-modal" class="modal large">
        <div class="modal-content">
          <div class="modal-header">
            <h2>⚙️ CONFIGURACIÓN DEL SISTEMA</h2>
            <button class="close-modal">&times;</button>
          </div>
          
          <form id="config-form">
            
            ${this.renderTimezoneSection(config)}
            
            ${this.renderObjectivesSection(config)}
            
            ${this.renderVisualizationSection(config)}
            
            ${this.renderAlertsSection(config)}
            
            ${this.renderDataSection()}
            
            <div class="form-actions">
              <button type="button" class="btn-secondary" id="restore-defaults">
                ↩️ Restaurar por Defecto
              </button>
              <button type="submit" class="btn-primary">
                💾 Guardar Configuración
              </button>
            </div>
          </form>
          
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('config-modal');
  }
  
  renderTimezoneSection(config) {
    return `
      <div class="config-section">
        <h3>🌎 ZONA HORARIA Y FORMATO</h3>
        
        <div class="form-group">
          <label>Zona horaria</label>
          <select name="timezone">
            <option value="America/Sao_Paulo" ${config.timezone === 'America/Sao_Paulo' ? 'selected' : ''}>
              Brasília (BRT, UTC-3)
            </option>
            <option value="America/New_York">Nueva York (EST/EDT)</option>
            <option value="Europe/London">Londres (GMT/BST)</option>
            <option value="Asia/Tokyo">Tokio (JST)</option>
          </select>
          <small>Todas las horas y análisis usan esta zona</small>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Formato fecha</label>
            <select name="dateFormat">
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Formato hora</label>
            <select name="timeFormat">
              <option value="24h">24 horas</option>
              <option value="12h">12 horas (AM/PM)</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Moneda</label>
            <select name="currency">
              <option value="USD">USD ($)</option>
              <option value="BRL">BRL (R$)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }
  
  renderObjectivesSection(config) {
    const obj = config.objectives;
    
    return `
      <div class="config-section">
        <h3>🎯 OBJETIVOS PERSONALES</h3>
        
        <h4>📊 Métricas Objetivo</h4>
        <div class="objectives-grid">
          <div class="form-group">
            <label>Win Rate objetivo (%)</label>
            <input type="number" name="objectives.winRate" value="${obj.winRate}" min="0" max="100">
            <small>Mínimo para considerar exitoso</small>
          </div>
          
          <div class="form-group">
            <label>R Promedio objetivo</label>
            <input type="number" step="0.1" name="objectives.rAverage" value="${obj.rAverage}" min="0">
            <small>Meta por trade</small>
          </div>
          
          <div class="form-group">
            <label>Trades ≥1.5R (%)</label>
            <input type="number" name="objectives.trades1_5R" value="${obj.trades1_5R}" min="0" max="100">
            <small>Del total</small>
          </div>
          
          <div class="form-group">
            <label>Trades ≥2R (%)</label>
            <input type="number" name="objectives.trades2R" value="${obj.trades2R}" min="0" max="100">
            <small>Del total</small>
          </div>
          
          <div class="form-group">
            <label>Drawdown máximo (%)</label>
            <input type="number" name="objectives.drawdownMax" value="${obj.drawdownMax}" min="0">
            <small>Alerta si se supera</small>
          </div>
        </div>
        
        <h4>💰 Objetivos Financieros</h4>
        <div class="objectives-grid">
          <div class="form-group">
            <label>Capital inicial ($)</label>
            <input type="number" name="capitalInicial" value="${config.capitalInicial}" min="0" step="100">
            <small>Para cálculo de %</small>
          </div>
          
          <div class="form-group">
            <label>Crecimiento mensual objetivo (%)</label>
            <input type="number" step="0.1" name="objectives.monthlyGrowth" value="${obj.monthlyGrowth}" min="0">
            <small>Meta de crecimiento de cuenta</small>
          </div>
          
          <div class="form-group">
            <label>Riesgo máximo por trade ($)</label>
            <input type="number" name="objectives.riskPerTrade" value="${obj.riskPerTrade}" min="0">
            <small>Límite de riesgo</small>
          </div>
        </div>
        
        <div class="projection-preview" id="growth-projection">
          <!-- Se actualiza dinámicamente -->
        </div>
        
        <h4>📅 Objetivos de Actividad</h4>
        <div class="objectives-grid">
          <div class="form-group">
            <label>Trades por día (promedio)</label>
            <input type="number" name="objectives.tradesPerDay" value="${obj.tradesPerDay || 2}" min="0">
          </div>
          
          <div class="form-group">
            <label>Días de trading por semana</label>
            <input type="number" name="objectives.daysPerWeek" value="${obj.daysPerWeek || 5}" min="0" max="7">
          </div>
          
          <div class="form-group">
            <label>Máximo trades por día</label>
            <input type="number" name="objectives.maxTradesPerDay" value="${obj.maxTradesPerDay || 4}" min="0">
            <small>Control de overtrading</small>
          </div>
        </div>
      </div>
    `;
  }
  
  renderVisualizationSection(config) {
    return `
      <div class="config-section">
        <h3>📊 VISUALIZACIÓN</h3>
        
        <div class="form-group">
          <label>Tamaño de bloque</label>
          <input type="number" name="blockSize" value="${config.blockSize || 10}" min="5" max="20">
          <small>Trades por bloque</small>
        </div>
        
        <div class="form-group">
          <label>Semana comienza</label>
          <select name="weekStart">
            <option value="monday">Lunes</option>
            <option value="sunday">Domingo</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Análisis temporal basado en</label>
          <div class="radio-group">
            <label>
              <input type="radio" name="timeAnalysis" value="open" checked>
              Hora de apertura del trade
            </label>
            <label>
              <input type="radio" name="timeAnalysis" value="close">
              Hora de cierre del trade
            </label>
          </div>
        </div>
        
        <h4>⏰ Franjas horarias (personalizar)</h4>
        <div id="hour-ranges-config">
          ${config.hourRanges.map((range, idx) => `
            <div class="hour-range-item">
              <input type="number" name="hourRanges[${idx}].start" value="${range.start}" min="0" max="23">
              <span>a</span>
              <input type="number" name="hourRanges[${idx}].end" value="${range.end}" min="0" max="24">
              <button type="button" class="btn-remove" data-index="${idx}">✕</button>
            </div>
          `).join('')}
        </div>
        <button type="button" id="add-hour-range" class="btn-secondary">+ Agregar franja</button>
      </div>
    `;
  }
  
  renderAlertsSection(config) {
    const alerts = config.alerts;
    
    return `
      <div class="config-section">
        <h3>🔔 ALERTAS Y NOTIFICACIONES</h3>
        <p class="section-description">Alertas visuales que aparecen en el dashboard</p>
        
        <h4>⚠️ Alertas de Riesgo</h4>
        <div class="alert-config-grid">
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.losingStreak.enabled" ${alerts.losingStreak.enabled ? 'checked' : ''}>
              Racha perdedora ≥
            </label>
            <input type="number" name="alerts.losingStreak.threshold" value="${alerts.losingStreak.threshold}" min="1" class="threshold-input">
            <span>trades</span>
          </div>
          
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.drawdown.enabled" ${alerts.drawdown.enabled ? 'checked' : ''}>
              Drawdown >
            </label>
            <input type="number" name="alerts.drawdown.threshold" value="${alerts.drawdown.threshold}" min="0" class="threshold-input">
            <span>%</span>
          </div>
          
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.winRateDaily.enabled" ${alerts.winRateDaily.enabled ? 'checked' : ''}>
              Win rate del día 
            </label>
            <input type="number" name="alerts.winRateDaily.threshold" value="${alerts.winRateDaily.threshold}" min="0" max="100" class="threshold-input">
            <span>%</span>
          </div>
          
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.overtrading.enabled" ${alerts.overtrading.enabled ? 'checked' : ''}>
              Supero máximo trades/día
            </label>
          </div>
          
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.riskExceeded.enabled" ${alerts.riskExceeded.enabled ? 'checked' : ''}>
              Riesgo del trade > límite
            </label>
          </div>
        </div>
        
        <h4>🎉 Alertas de Logros</h4>
        <div class="alert-config-grid">
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.goalAchieved.enabled" ${alerts.goalAchieved.enabled ? 'checked' : ''}>
              Al alcanzar objetivo mensual
            </label>
          </div>
          
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.blockSuccess.enabled" ${alerts.blockSuccess.enabled ? 'checked' : ''}>
              Al completar bloque exitoso (≥60% win)
            </label>
          </div>
          
          <div class="alert-item">
            <label>
              <input type="checkbox" name="alerts.winStreak.enabled" ${alerts.winStreak.enabled ? 'checked' : ''}>
              Racha ganadora de
            </label>
            <input type="number" name="alerts.winStreak.threshold" value="${alerts.winStreak.threshold || 5}" min="1" class="threshold-input">
            <span>trades</span>
          </div>
        </div>
        
        <div class="alert-note">
          <p>ℹ️ Estas alertas son VISUALES (aparecen en el dashboard).</p>
          <p>NO son notificaciones push/email (disponible en futuras versiones).</p>
        </div>
      </div>
    `;
  }
  
  renderDataSection() {
    return `
      <div class="config-section">
        <h3>💾 DATOS Y RESPALDO</h3>
        
        <div class="data-status" id="data-status">
          <!-- Se actualiza dinámicamente -->
        </div>
        
        <div class="data-actions">
          <button type="button" id="export-csv" class="btn-secondary">
            📤 Exportar CSV Backup
          </button>
          
          <button type="button" id="import-csv" class="btn-secondary">
            📥 Importar desde CSV
          </button>
          <input type="file" id="import-file" accept=".csv" style="display:none;">
          
          <button type="button" id="sync-sheet" class="btn-secondary">
            🔄 Sincronizar con Google Sheet
          </button>
          
          <button type="button" id="clear-data" class="btn-danger">
            🗑️ Borrar todos los datos
          </button>
        </div>
      </div>
    `;
  }
  
  attachEventListeners() {
    const form = document.getElementById('config-form');
    
    // Cerrar modal
    this.modal.querySelector('.close-modal').addEventListener('click', () => {
      this.close();
    });
    
    // Actualizar proyección de crecimiento dinámicamente
    ['capitalInicial', 'objectives.monthlyGrowth'].forEach(field => {
      form.querySelector(`[name="${field}"]`).addEventListener('input', () => {
        this.updateGrowthProjection();
      });
    });
    
    // Agregar/remover franjas horarias
    document.getElementById('add-hour-range').addEventListener('click', () => {
      this.addHourRange();
    });
    
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.removeHourRange(parseInt(e.target.dataset.index));
      });
    });
    
    // Acciones de datos
    document.getElementById('export-csv').addEventListener('click', () => {
      new SheetSync().exportToSheet();
    });
    
    document.getElementById('import-csv').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await new SheetSync().importFromSheet(file);
        showNotification('Datos importados correctamente', 'success');
      }
    });
    
    document.getElementById('clear-data').addEventListener('click', async () => {
      if (confirm('⚠️ ¿Seguro que deseas borrar TODOS los datos? Esta acción no se puede deshacer.')) {
        if (confirm('Confirma nuevamente. Todos los trades y configuración se perderán.')) {
          await new StorageManager().clearAll();
          showNotification('Datos borrados', 'info');
          window.location.reload();
        }
      }
    });
    
    // Restaurar defaults
    document.getElementById('restore-defaults').addEventListener('click', () => {
      if (confirm('¿Restaurar configuración por defecto?')) {
        this.currentConfig = getDefaultConfig();
        this.close();
        this.open();
      }
    });
    
    // Submit form
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });
    
    // Actualizar status de datos
    this.updateDataStatus();
  }
  
  async updateDataStatus() {
    const storage = new StorageManager();
    const data = await storage.getTrades();
    const syncStatus = await new SyncManager().syncStatus();
    
    document.getElementById('data-status').innerHTML = `
      <p>Trades guardados localmente: <strong>${data.trades.length}</strong></p>
      <p>Última sincronización: ${syncStatus.lastSync ? formatDate(syncStatus.lastSync) : 'Nunca'}</p>
      ${syncStatus.needsSync ? '<p class="warning">⚠️ Se recomienda sincronizar (han pasado >48h)</p>' : ''}
    `;
  }
  
  updateGrowthProjection() {
    const form = document.getElementById('config-form');
    const capital = parseFloat(form.querySelector('[name="capitalInicial"]').value) || 0;
    const growth = parseFloat(form.querySelector('[name="objectives.monthlyGrowth"]').value) || 0;
    
    if (capital > 0 && growth > 0) {
      const month1 = capital * (growth / 100);
      const projections = [
        { months: 1, amount: month1, total: capital + month1 },
        { months: 3, total: capital * Math.pow(1 + growth/100, 3) },
        { months: 12, total: capital * Math.pow(1 + growth/100, 12) }
      ];
      
      document.getElementById('growth-projection').innerHTML = `
        <h5>📈 Proyección con ${growth}% mensual:</h5>
        <ul>
          ${projections.map(p => `
            <li>Mes ${p.months}: $${p.total.toFixed(2)} ${p.amount ? `(+$${p.amount.toFixed(2)})` : ''}</li>
          `).join('')}
        </ul>
      `;
    }
  }
  
  async handleSubmit() {
    try {
      const formData = new FormData(document.getElementById('config-form'));
      const newConfig = this.buildConfigObject(formData);
      
      // Guardar
      const storage = new StorageManager();
      await storage.saveConfig(newConfig);
      
      showNotification('Configuración guardada correctamente', 'success');
      this.close();
      
      // Recargar dashboard
      window.location.reload();
      
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  }
  
  buildConfigObject(formData) {
    // Construir objeto de configuración desde FormData
    const config = {
      version: '1.0',
      timezone: formData.get('timezone'),
      dateFormat: formData.get('dateFormat'),
      timeFormat: formData.get('timeFormat'),
      currency: formData.get('currency'),
      capitalInicial: parseFloat(formData.get('capitalInicial')),
      blockSize: parseInt(formData.get('blockSize')),
      weekStart: formData.get('weekStart'),
      timeAnalysis: formData.get('timeAnalysis'),
      
      objectives: {
        winRate: parseFloat(formData.get('objectives.winRate')),
        rAverage: parseFloat(formData.get('objectives.rAverage')),
        trades1_5R: parseFloat(formData.get('objectives.trades1_5R')),
        trades2R: parseFloat(formData.get('objectives.trades2R')),
        drawdownMax: parseFloat(formData.get('objectives.drawdownMax')),
        monthlyGrowth: parseFloat(formData.get('objectives.monthlyGrowth')),
        riskPerTrade: parseFloat(formData.get('objectives.riskPerTrade')),
        tradesPerDay: parseFloat(formData.get('objectives.tradesPerDay')),
        daysPerWeek: parseInt(formData.get('objectives.daysPerWeek')),
        maxTradesPerDay: parseInt(formData.get('objectives.maxTradesPerDay'))
      },
      
      hourRanges: this.extractHourRanges(formData),
      
      alerts: this.extractAlerts(formData)
    };
    
    return config;
  }
  
  extractHourRanges(formData) {
    const ranges = [];
    let i = 0;
    
    while (formData.has(`hourRanges[${i}].start`)) {
      ranges.push({
        start: parseInt(formData.get(`hourRanges[${i}].start`)),
        end: parseInt(formData.get(`hourRanges[${i}].end`))
      });
      i++;
    }
    
    return ranges.length > 0 ? ranges : getDefaultHourRanges();
  }
  
  extractAlerts(formData) {
    return {
      losingStreak: {
        enabled: formData.get('alerts.losingStreak.enabled')ReintentarMContinuarjavascript        enabled: formData.get('alerts.losingStreak.enabled') === 'on',
        threshold: parseInt(formData.get('alerts.losingStreak.threshold'))
      },
      drawdown: {
        enabled: formData.get('alerts.drawdown.enabled') === 'on',
        threshold: parseFloat(formData.get('alerts.drawdown.threshold'))
      },
      winRateDaily: {
        enabled: formData.get('alerts.winRateDaily.enabled') === 'on',
        threshold: parseFloat(formData.get('alerts.winRateDaily.threshold'))
      },
      overtrading: {
        enabled: formData.get('alerts.overtrading.enabled') === 'on'
      },
      riskExceeded: {
        enabled: formData.get('alerts.riskExceeded.enabled') === 'on'
      },
      goalAchieved: {
        enabled: formData.get('alerts.goalAchieved.enabled') === 'on'
      },
      blockSuccess: {
        enabled: formData.get('alerts.blockSuccess.enabled') === 'on'
      },
      winStreak: {
        enabled: formData.get('alerts.winStreak.enabled') === 'on',
        threshold: parseInt(formData.get('alerts.winStreak.threshold'))
      }
    };
  }
  
  addHourRange() {
    const container = document.getElementById('hour-ranges-config');
    const index = container.querySelectorAll('.hour-range-item').length;
    
    const rangeHTML = `
      <div class="hour-range-item">
        <input type="number" name="hourRanges[${index}].start" value="0" min="0" max="23">
        <span>a</span>
        <input type="number" name="hourRanges[${index}].end" value="3" min="0" max="24">
        <button type="button" class="btn-remove" data-index="${index}">✕</button>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', rangeHTML);
  }
  
  removeHourRange(index) {
    const item = document.querySelector(`.hour-range-item:nth-child(${index + 1})`);
    if (item) item.remove();
  }
  
  close() {
    this.modal.remove();
  }
}

function getDefaultConfig() {
  return {
    version: '1.0',
    timezone: 'America/Sao_Paulo',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    currency: 'USD',
    capitalInicial: 10000,
    blockSize: 10,
    weekStart: 'monday',
    timeAnalysis: 'open',
    
    objectives: {
      winRate: 60,
      rAverage: 0.80,
      trades1_5R: 30,
      trades2R: 15,
      drawdownMax: 10,
      monthlyGrowth: 4,
      riskPerTrade: 150,
      tradesPerDay: 2,
      daysPerWeek: 5,
      maxTradesPerDay: 4
    },
    
    hourRanges: [
      { start: 6, end: 9 },
      { start: 9, end: 12 },
      { start: 12, end: 15 },
      { start: 15, end: 18 },
      { start: 18, end: 21 },
      { start: 21, end: 0 }
    ],
    
    alerts: {
      losingStreak: { enabled: true, threshold: 3 },
      drawdown: { enabled: true, threshold: 5 },
      winRateDaily: { enabled: true, threshold: 40 },
      overtrading: { enabled: true },
      riskExceeded: { enabled: true },
      goalAchieved: { enabled: true },
      blockSuccess: { enabled: true },
      winStreak: { enabled: true, threshold: 5 }
    }
  };
}

7. MÓDULO 6: SISTEMA DE ALERTAS
7.1 Propósito
Sistema de alertas visuales que aparecen en el dashboard cuando se cumplen ciertas condiciones.
7.2 Alert Manager
javascriptclass AlertManager {
  constructor(trades, config) {
    this.trades = trades;
    this.config = config;
    this.activeAlerts = [];
  }
  
  async checkAlerts() {
    this.activeAlerts = [];
    
    if (!this.trades || this.trades.length === 0) return;
    
    // Verificar todas las alertas configuradas
    await this.checkLosingStreak();
    await this.checkDrawdown();
    await this.checkWinRateDaily();
    await this.checkOvertrading();
    await this.checkGoalAchieved();
    await this.checkBlockSuccess();
    await this.checkWinStreak();
    
    return this.activeAlerts;
  }
  
  async checkLosingStreak() {
    const config = this.config.alerts.losingStreak;
    if (!config.enabled) return;
    
    const streak = this.getCurrentLosingStreak();
    
    if (streak >= config.threshold) {
      this.activeAlerts.push({
        type: 'warning',
        severity: 'high',
        title: 'Racha Perdedora Detectada',
        message: `Has tenido ${streak} pérdidas seguidas. Considera pausar y revisar tu estrategia.`,
        icon: '⚠️',
        action: {
          label: 'Ver detalles',
          handler: () => this.showLosingStreakDetails()
        }
      });
    }
  }
  
  async checkDrawdown() {
    const config = this.config.alerts.drawdown;
    if (!config.enabled) return;
    
    const drawdown = this.calculateCurrentDrawdown();
    
    if (drawdown > config.threshold) {
      this.activeAlerts.push({
        type: 'danger',
        severity: 'critical',
        title: 'Drawdown Elevado',
        message: `Tu drawdown actual es ${drawdown.toFixed(1)}% (límite: ${config.threshold}%). Reduce tamaño de posición.`,
        icon: '🚨',
        action: {
          label: 'Ver análisis',
          handler: () => this.navigateToView('continuous')
        }
      });
    }
  }
  
  async checkWinRateDaily() {
    const config = this.config.alerts.winRateDaily;
    if (!config.enabled) return;
    
    const todayTrades = this.getTodayTrades();
    if (todayTrades.length < 3) return; // Mínimo 3 trades para evaluar
    
    const winners = todayTrades.filter(t => t.result > 0);
    const winRate = (winners.length / todayTrades.length) * 100;
    
    if (winRate < config.threshold) {
      this.activeAlerts.push({
        type: 'warning',
        severity: 'medium',
        title: 'Win Rate Bajo Hoy',
        message: `Tu win rate hoy es ${winRate.toFixed(0)}% (${winners.length}/${todayTrades.length}). Esperado: ≥${config.threshold}%`,
        icon: '⚠️',
        action: {
          label: 'Ver trades de hoy',
          handler: () => this.showTodayTrades()
        }
      });
    }
  }
  
  async checkOvertrading() {
    const config = this.config.alerts.overtrading;
    if (!config.enabled) return;
    
    const todayTrades = this.getTodayTrades();
    const maxTrades = this.config.objectives.maxTradesPerDay;
    
    if (todayTrades.length >= maxTrades) {
      this.activeAlerts.push({
        type: 'warning',
        severity: 'medium',
        title: 'Límite de Trades Alcanzado',
        message: `Has realizado ${todayTrades.length} trades hoy (límite: ${maxTrades}). Considera no operar más.`,
        icon: '🛑',
        dismissable: true
      });
    }
  }
  
  async checkGoalAchieved() {
    const config = this.config.alerts.goalAchieved;
    if (!config.enabled) return;
    
    const monthTrades = this.getCurrentMonthTrades();
    const monthlyPnL = monthTrades.reduce((sum, t) => sum + t.result, 0);
    const monthlyTarget = this.config.capitalInicial * (this.config.objectives.monthlyGrowth / 100);
    
    if (monthlyPnL >= monthlyTarget) {
      // Verificar si ya se mostró esta alerta este mes
      const alertKey = `goal-achieved-${new Date().getMonth()}`;
      const shown = await this.wasAlertShown(alertKey);
      
      if (!shown) {
        this.activeAlerts.push({
          type: 'success',
          severity: 'celebration',
          title: '🎉 ¡OBJETIVO ALCANZADO!',
          message: `Has logrado +${this.config.objectives.monthlyGrowth}% este mes. Capital: $${(this.config.capitalInicial + monthlyPnL).toFixed(2)} (+$${monthlyPnL.toFixed(2)})`,
          icon: '🚀',
          persistent: true,
          action: {
            label: 'Ver métricas del mes',
            handler: () => this.navigateToView('temporal')
          }
        });
        
        await this.markAlertAsShown(alertKey);
      }
    }
  }
  
  async checkBlockSuccess() {
    const config = this.config.alerts.blockSuccess;
    if (!config.enabled) return;
    
    const lastBlock = this.getLastCompletedBlock();
    if (!lastBlock) return;
    
    const winners = lastBlock.trades.filter(t => t.result > 0);
    const winRate = (winners.length / lastBlock.trades.length) * 100;
    
    if (lastBlock.trades.length === 10 && winRate >= 60) {
      const alertKey = `block-success-${lastBlock.number}`;
      const shown = await this.wasAlertShown(alertKey);
      
      if (!shown) {
        this.activeAlerts.push({
          type: 'success',
          severity: 'celebration',
          title: '🎉 Bloque Exitoso Completado',
          message: `Bloque ${lastBlock.number}: ${winRate.toFixed(0)}% win rate. ¡Excelente consistencia!`,
          icon: '✅',
          confetti: true,
          action: {
            label: 'Ver bloque',
            handler: () => this.navigateToBlock(lastBlock.number)
          }
        });
        
        await this.markAlertAsShown(alertKey);
      }
    }
  }
  
  async checkWinStreak() {
    const config = this.config.alerts.winStreak;
    if (!config.enabled) return;
    
    const streak = this.getCurrentWinStreak();
    
    if (streak >= config.threshold) {
      const alertKey = `win-streak-${streak}`;
      const shown = await this.wasAlertShown(alertKey);
      
      if (!shown) {
        this.activeAlerts.push({
          type: 'success',
          severity: 'info',
          title: '🔥 Racha Ganadora',
          message: `¡${streak} trades ganadores seguidos! Mantén la disciplina.`,
          icon: '🎯',
          dismissable: true
        });
        
        await this.markAlertAsShown(alertKey);
      }
    }
  }
  
  // Métodos auxiliares
  
  getCurrentLosingStreak() {
    let streak = 0;
    for (let i = this.trades.length - 1; i >= 0; i--) {
      if (this.trades[i].result <= 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }
  
  getCurrentWinStreak() {
    let streak = 0;
    for (let i = this.trades.length - 1; i >= 0; i--) {
      if (this.trades[i].result > 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }
  
  calculateCurrentDrawdown() {
    let peak = 0;
    let current = 0;
    
    this.trades.forEach(trade => {
      current += trade.result;
      peak = Math.max(peak, current);
    });
    
    if (peak === 0) return 0;
    return ((peak - current) / peak) * 100;
  }
  
  getTodayTrades() {
    const today = formatDate(new Date());
    return this.trades.filter(t => formatDate(t.openTimeBRT) === today);
  }
  
  getCurrentMonthTrades() {
    const now = new Date();
    return this.trades.filter(t => {
      const tradeDate = new Date(t.openTimeBRT);
      return tradeDate.getMonth() === now.getMonth() && 
             tradeDate.getFullYear() === now.getFullYear();
    });
  }
  
  getLastCompletedBlock() {
    const blocks = {};
    this.trades.forEach(t => {
      if (!blocks[t.block]) blocks[t.block] = [];
      blocks[t.block].push(t);
    });
    
    const completedBlocks = Object.entries(blocks)
      .filter(([_, trades]) => trades.length === 10)
      .map(([block, trades]) => ({ number: parseInt(block), trades }))
      .sort((a, b) => b.number - a.number);
    
    return completedBlocks.length > 0 ? completedBlocks[0] : null;
  }
  
  async wasAlertShown(key) {
    const state = await window.storage.get('alerts-state');
    if (!state) return false;
    
    const alertsState = JSON.parse(state.value);
    return alertsState[key] === true;
  }
  
  async markAlertAsShown(key) {
    let alertsState = {};
    const state = await window.storage.get('alerts-state');
    
    if (state) {
      alertsState = JSON.parse(state.value);
    }
    
    alertsState[key] = true;
    await window.storage.set('alerts-state', JSON.stringify(alertsState));
  }
  
  navigateToView(view) {
    // Cambiar a la vista especificada
    window.dashboardApp.switchView(view);
  }
  
  navigateToBlock(blockNumber) {
    window.dashboardApp.switchView('blocks');
    window.dashboardApp.expandBlock(blockNumber);
  }
  
  showLosingStreakDetails() {
    // Mostrar modal con detalles de la racha perdedora
    const streak = this.getCurrentLosingStreak();
    const recentTrades = this.trades.slice(-streak);
    
    // Implementar modal de detalles
  }
  
  showTodayTrades() {
    // Filtrar tabla para mostrar solo trades de hoy
    window.dashboardApp.switchView('table');
    window.dashboardApp.filterByToday();
  }
}
7.3 Alert Display Component
javascriptclass AlertDisplay {
  constructor(containerEl) {
    this.container = containerEl;
    this.alerts = [];
  }
  
  async render() {
    const alertManager = new AlertManager(
      await new StorageManager().getTrades().then(d => d.trades),
      await new StorageManager().getConfig()
    );
    
    this.alerts = await alertManager.checkAlerts();
    
    if (this.alerts.length === 0) {
      this.container.innerHTML = '';
      return;
    }
    
    this.container.innerHTML = `
      <div class="alert-container">
        ${this.alerts.map(alert => this.renderAlert(alert)).join('')}
      </div>
    `;
    
    this.attachEventListeners();
    
    // Confetti para celebraciones
    this.alerts.forEach(alert => {
      if (alert.confetti) {
        this.triggerConfetti();
      }
    });
  }
  
  renderAlert(alert) {
    const severityClass = `alert-${alert.severity}`;
    const typeClass = `alert-${alert.type}`;
    
    return `
      <div class="alert ${severityClass} ${typeClass}" data-alert-id="${alert.title}">
        <div class="alert-icon">${alert.icon}</div>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-message">${alert.message}</div>
          ${alert.action ? `
            <button class="alert-action" data-action="${alert.title}">
              ${alert.action.label}
            </button>
          ` : ''}
        </div>
        ${alert.dismissable || !alert.persistent ? `
          <button class="alert-close" data-close="${alert.title}">✕</button>
        ` : ''}
      </div>
    `;
  }
  
  attachEventListeners() {
    // Acciones de alertas
    document.querySelectorAll('.alert-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const alertTitle = e.target.dataset.action;
        const alert = this.alerts.find(a => a.title === alertTitle);
        if (alert && alert.action) {
          alert.action.handler();
        }
      });
    });
    
    // Cerrar alertas
    document.querySelectorAll('.alert-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const alertTitle = e.target.dataset.close;
        this.dismissAlert(alertTitle);
      });
    });
  }
  
  dismissAlert(title) {
    const alertEl = document.querySelector(`[data-alert-id="${title}"]`);
    if (alertEl) {
      alertEl.classList.add('alert-dismissed');
      setTimeout(() => alertEl.remove(), 300);
    }
  }
  
  triggerConfetti() {
    // Implementar efecto de confetti
    // Puede usar una librería como canvas-confetti
    if (window.confetti) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }
}
```

---

## 8. FLUJOS COMPLETOS DE USUARIO

### 8.1 Flujo 1: Agregar Trade desde Plataforma
```
1. Usuario copia datos de la plataforma Funding
2. Abre parser.html
3. Pega datos en textarea
4. Parser detecta formato y datos
5. Si hay múltiples órdenes agrupables:
   → Muestra sugerencia de agrupación
   → Usuario confirma o ajusta
6. Calcula automáticamente:
   → Entry/Exit promedio (si agrupado)
   → Duración
   → R ejecutado
7. Usuario completa:
   → SL, TP, Riesgo Planeado
   → Trade Number (auto-sugerido)
   → Ítem y Observación (opcional)
8. Parser genera 3 salidas:
   → Plantilla Telegram (copiar)
   → Línea CSV para Sheet (copiar)
   → Guarda automáticamente en HTML storage
9. Usuario copia plantilla a Telegram
10. Usuario pega línea en Google Sheet
11. Dashboard se actualiza automáticamente
```

### 8.2 Flujo 2: Agregar Trade Manualmente desde Dashboard
```
1. Usuario abre Dashboard
2. Click en "➕ Agregar Trade"
3. Modal se abre con formulario
4. Trade Number auto-sugerido
5. Usuario llena campos:
   → Fecha/Hora apertura
   → Símbolo, Tipo (LONG/SHORT)
   → Entry, Exit, SL, TP
   → Riesgo Planeado, Resultado
   → Ítem, Observación (opcional)
6. R Plan y R Exec se calculan en tiempo real
7. Validación de datos al submit
8. Trade se guarda en storage
9. Métricas globales se recalculan
10. Dashboard se recarga mostrando nuevo trade
```

### 8.3 Flujo 3: Sincronización Sheet ↔ Dashboard
```
EXPORT (Dashboard → Sheet):
1. Usuario click en "📤 Export CSV"
2. Se genera CSV completo con todos los trades
3. Archivo se descarga
4. Usuario abre Google Sheet
5. Pega datos en hoja TRADES
6. Formato condicional se aplica automáticamente

IMPORT (Sheet → Dashboard):
1. Usuario exporta CSV desde Google Sheet
2. En Dashboard, click "📥 Import CSV"
3. Selecciona archivo
4. Parser valida estructura
5. Sistema detecta duplicados (por Order ID)
6. Merge inteligente:
   → Nuevos trades se agregan
   → Existentes se mantienen
7. Métricas se recalculan
8. Dashboard se actualiza
```

### 8.4 Flujo 4: Restauración Post-Caché Borrado
```
1. Usuario borra caché del navegador
2. window.storage se pierde
3. Usuario abre Dashboard
4. Dashboard detecta storage vacío
5. Muestra alerta: "No hay datos. Importar desde Sheet?"
6. Usuario exporta CSV desde Google Sheet
7. Importa en Dashboard
8. Sistema restaura:
   → Todos los trades
   → Configuración (si estaba en CSV)
9. Dashboard completamente funcional nuevamente

9. TESTS DE CONSISTENCIA
9.1 Tests Críticos de Integridad
javascript// Test Suite: Consistencia de Datos

class ConsistencyTests {
  
  async runAll() {
    console.log('🧪 Ejecutando tests de consistencia...');
    
    const results = [
      await this.testStoragePersistence(),
      await this.testDuplicatePrevention(),
      await this.testDataIntegrity(),
      await this.testCalculationAccuracy(),
      await this.testCSVRoundtrip(),
      await this.testAlertTriggering()
    ];
    
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    
    console.log(`✅ ${passed}/${total} tests passed`);
    
    return { passed, total, results };
  }
  
  async testStoragePersistence() {
    try {
      const storage = new StorageManager();
      const testTrade = createMockTrade();
      
      // Guardar
      await storage.saveTrade(testTrade);
      
      // Leer
      const data = await storage.getTrades();
      const saved = data.trades.find(t => t.tradeNumber === testTrade.tradeNumber);
      
      // Verificar
      assert(saved !== undefined, 'Trade should be saved');
      assert(saved.orderIDs[0] === testTrade.orderIDs[0], 'Order ID should match');
      
      // Limpiar
      await storage.deleteTrade(testTrade.tradeNumber);
      
      return { name: 'Storage Persistence', passed: true };
    } catch (error) {
      return { name: 'Storage Persistence', passed: false, error: error.message };
    }
  }
  
  async testDuplicatePrevention() {
    try {
      const storage = new StorageManager();
      const trade = createMockTrade();
      
      // Guardar primera vez
      await storage.saveTrade(trade);
      
      // Intentar guardar duplicado
      let errorThrown = false;
      try {
        await storage.saveTrade(trade);
      } catch (e) {
        errorThrown = true;
      }
      
      assert(errorThrown, 'Should prevent duplicate trades');
      
      // Limpiar
      await storage.deleteTrade(trade.tradeNumber);
      
      return { name: 'Duplicate Prevention', passed: true };
    } catch (error) {
      return { name: 'Duplicate Prevention', passed: false, error: error.message };
    }
  }
  
  async testDataIntegrity() {
    try {
      const trade = createMockTrade();
      
      // Validar campos requeridos
      validateTrade(trade);
      
      // Verificar cálculos
      assert(trade.rPlanned === trade.result / trade.riskPlanned, 'R Plan calculation should be correct');
      assert(trade.block === Math.ceil(trade.tradeNumber / 10), 'Block should be calculated correctly');
      
      return { name: 'Data Integrity', passed: true };
    } catch (error) {
      return { name: 'Data Integrity', passed: false, error: error.message };
    }
  }
  
  async testCalculationAccuracy() {
    try {
      const trades = [
        { result: 100, riskPlanned: 100 },  // 1R
        { result: -50, riskPlanned: 100 },  // -0.5R
        { result: 150, riskPlanned: 100 }   // 1.5R
      ];
      
      trades.forEach(t => {
        t.rPlanned = t.result / t.riskPlanned;
      });
      
      const avgR = trades.reduce((sum, t) => sum + t.rPlanned, 0) / trades.length;
      const expectedAvg = (1 + (-0.5) + 1.5) / 3;
      
      assert(Math.abs(avgR - expectedAvg) < 0.01, 'Average R calculation should be accurate');
      
      return { name: 'Calculation Accuracy', passed: true };
    } catch (error) {
      return { name: 'Calculation Accuracy', passed: false, error: error.message };
    }
  }
  
  async testCSVRoundtrip() {
    try {
      const trades = [createMockTrade(), createMockTrade({ tradeNumber: 2 })];
      
      // Export to CSV
      const csv = exportToCSV(trades);
      
      // Import from CSV
      const imported = parseCSV(csv);
      
      // Verify
      assert(imported.length === trades.length, 'Should import same number of trades');
      assert(imported[0].tradeNumber === trades[0].tradeNumber, 'Trade data should be preserved');
      
      return { name: 'CSV Roundtrip', passed: true };
    } catch (error) {
      return { name: 'CSV Roundtrip', passed: false, error: error.message };
    }
  }
  
  async testAlertTriggering() {
    try {
      const config = getDefaultConfig();
      const trades = [
        createMockTrade({ result: -50 }),
        createMockTrade({ result: -60, tradeNumber: 2 }),
        createMockTrade({ result: -70, tradeNumber: 3 })
      ];
      
      const alertManager = new AlertManager(trades, config);
      const alerts = await alertManager.checkAlerts();
      
      // Debería haber alerta de racha perdedora
      const losingStreakAlert = alerts.find(a => a.title.includes('Racha Perdedora'));
      assert(losingStreakAlert !== undefined, 'Should trigger losing streak alert');
      
      return { name: 'Alert Triggering', passed: true };
    } catch (error) {
      return { name: 'Alert Triggering', passed: false, error: error.message };
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createMockTrade(overrides = {}) {
  return {
    tradeNumber: 1,
    block: 1,
    orderIDs: ['TEST_' + Date.now()],
    isGrouped: false,
    groupCount: 1,
    openTimeBRT: new Date().toISOString(),
    closeTimeBRT: new Date().toISOString(),
    symbol: 'BTCUSDT',
    type: 'LONG',
    entry: 68000,
    exitPrice: 68500,
    stopLoss: 67500,
    takeProfit: 69000,
    riskPlanned: 100,
    riskExecuted: 100,
    result: 50,
    rPlanned: 0.5,
    rExecuted: 0.5,
    riskDeviation: 0,
    riskDeviationFlag: '✓',
    duration: '2h 30m',
    durationMinutes: 150,
    openHourBRT: 14,
    openHourRange: '12-15',
    openDayOfWeek: 'Lunes',
    item: 'Test',
    observation: 'Test trade',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}
9.2 Test de Stress
javascriptasync function stressTest() {
  console.log('🔥 Iniciando stress test...');
  
  const storage = new StorageManager();
  
  // Test 1: Guardar 100 trades
  console.log('Test 1: Guardando 100 trades...');
  const start1 = Date.now();
  
  for (let i = 1; i <= 100; i++) {
    await storage.saveTrade(createMockTrade({ tradeNumber: i, orderIDs: [`TEST_${i}`] }));
  }
  
  const time1 = Date.now() - start1;
  console.log(`✅ 100 trades guardados en ${time1}ms`);
  
  // Test 2: Leer todos los trades
  console.log('Test 2: Leyendo 100 trades...');
  const start2 = Date.now();
  
  const data = await storage.getTrades();
  
  const time2 = Date.now() - start2;
  console.log(`✅ 100 trades leídos en ${time2}ms`);
  
  // Test 3: Calcular métricas globales
  console.log('Test 3: Calculando métricas...');
  const start3 = Date.now();
  
  const metrics = new ContinuousProgress(null, data.trades, getDefaultConfig()).calculateGlobalMetrics(data.trades);
  
  const time3 = Date.now() - start3;
  console.log(`✅ Métricas calculadas en ${time3}ms`);
  
  // Test 4: Exportar CSV
  console.log('Test 4: Exportando CSV...');
  const start4 = Date.now();
  
  const csv = exportToCSV(data.trades);
  
  const time4 = DateReintentarMContinuarjavascript  const time4 = Date.now() - start4;
  console.log(`✅ CSV exportado en ${time4}ms (${csv.length} caracteres)`);
  
  // Test 5: Importar CSV
  console.log('Test 5: Importando CSV...');
  const start5 = Date.now();
  
  const imported = parseCSV(csv);
  
  const time5 = Date.now() - start5;
  console.log(`✅ CSV importado en ${time5}ms (${imported.length} trades)`);
  
  // Test 6: Renderizar tabla completa
  console.log('Test 6: Renderizando tabla...');
  const start6 = Date.now();
  
  const container = document.createElement('div');
  const table = new TradeTable(container, data.trades);
  table.render();
  
  const time6 = Date.now() - start6;
  console.log(`✅ Tabla renderizada en ${time6}ms`);
  
  // Limpiar
  await storage.clearAll();
  
  console.log('\n📊 RESUMEN STRESS TEST:');
  console.log(`- Guardar 100 trades: ${time1}ms (${(time1/100).toFixed(2)}ms/trade)`);
  console.log(`- Leer 100 trades: ${time2}ms`);
  console.log(`- Calcular métricas: ${time3}ms`);
  console.log(`- Exportar CSV: ${time4}ms`);
  console.log(`- Importar CSV: ${time5}ms`);
  console.log(`- Renderizar tabla: ${time6}ms`);
  
  const totalTime = time1 + time2 + time3 + time4 + time5 + time6;
  console.log(`\n⏱️ Tiempo total: ${totalTime}ms`);
  
  if (totalTime < 5000) {
    console.log('✅ Performance excelente');
  } else if (totalTime < 10000) {
    console.log('⚠️ Performance aceptable');
  } else {
    console.log('❌ Performance necesita optimización');
  }
}
```

---

## 10. PLAN DE IMPLEMENTACIÓN

### 10.1 Orden de Desarrollo
```
FASE 1: FUNDAMENTOS (Semana 1)
├── 1.1 Sistema de almacenamiento
│   ├── StorageManager class
│   ├── Validación de datos
│   └── Tests básicos
├── 1.2 Parser básico
│   ├── Detección de formato
│   ├── Extracción de datos
│   └── Conversión UTC → BRT
└── 1.3 Estructura de datos
    ├── Trade object schema
    ├── Config object schema
    └── Funciones de cálculo

FASE 2: PARSER COMPLETO (Semana 2)
├── 2.1 Detección de agrupables
├── 2.2 Interfaz de agrupación
├── 2.3 Completar datos faltantes
├── 2.4 Generación de salidas
│   ├── Plantilla Telegram
│   ├── Línea CSV
│   └── Objeto JSON
└── 2.5 Tests del parser

FASE 3: DASHBOARD BÁSICO (Semana 3)
├── 3.1 Estructura HTML base
├── 3.2 Vista 1: Tabla de trades
│   ├── Tabla básica
│   ├── Expansión de filas
│   ├── Edición inline
│   └── Ordenamiento/filtrado
├── 3.3 Vista 3: Progreso Continuo
│   ├── Métricas globales
│   ├── Equity curve
│   └── Objetivos
└── 3.4 Integración storage ↔ vistas

FASE 4: VISTAS AVANZADAS (Semana 4)
├── 4.1 Vista 2: Análisis por Bloques
│   ├── Agrupación por bloques
│   ├── Expansión de bloques
│   └── Métricas por bloque
├── 4.2 Vista 4: Análisis Temporal
│   ├── Análisis mensual/semanal
│   ├── Heat map
│   ├── Mejores/peores días
│   └── Análisis por hora
└── 4.3 Vista 5: Expected Value
    ├── Cálculo de EV
    ├── EV por símbolo/dirección
    ├── Evolución de EV
    └── Simulaciones

FASE 5: CONFIGURACIÓN Y ALERTAS (Semana 5)
├── 5.1 Sistema de configuración
│   ├── Modal de configuración
│   ├── Objetivos personalizables
│   ├── Franjas horarias
│   └── Guardar/cargar config
├── 5.2 Sistema de alertas
│   ├── Alert Manager
│   ├── Verificación de condiciones
│   ├── Display de alertas
│   └── Persistencia de estado
└── 5.3 Agregar trade manual
    ├── Modal de formulario
    ├── Validación en tiempo real
    └── Consistencia con parser

FASE 6: INTEGRACIÓN GOOGLE SHEETS (Semana 6)
├── 6.1 Exportar CSV
├── 6.2 Importar CSV
├── 6.3 Merge inteligente
├── 6.4 Sincronización bidireccional
└── 6.5 Tests de roundtrip

FASE 7: TESTING Y OPTIMIZACIÓN (Semana 7)
├── 7.1 Suite de tests completa
├── 7.2 Stress testing
├── 7.3 Optimización de performance
├── 7.4 Bug fixes
└── 7.5 Validación de consistencia

FASE 8: DOCUMENTACIÓN Y PULIDO (Semana 8)
├── 8.1 Guía de usuario
├── 8.2 Tooltips y ayudas
├── 8.3 Estilos finales
├── 8.4 Responsive design
└── 8.5 Testing en diferentes navegadores
10.2 Priorización de Features
CRÍTICO (Must Have):

✅ Sistema de almacenamiento persistente
✅ Parser dual (Telegram + Sheet)
✅ Tabla de trades con edición
✅ Métricas básicas (Win%, R avg, P&L)
✅ Exportar/Importar CSV
✅ Agrupación de posiciones
✅ Cálculo de R Planeado vs Ejecutado

IMPORTANTE (Should Have):

✅ Vista por bloques
✅ Vista temporal con heat map
✅ Vista de Expected Value
✅ Sistema de configuración
✅ Alertas visuales básicas
✅ Agregar trade manual

DESEABLE (Nice to Have):

⚪ Gráficos interactivos avanzados
⚪ Exportar reportes PDF
⚪ Dark mode
⚪ Atajos de teclado
⚪ Búsqueda avanzada con filtros complejos

FUTURO (Future Enhancements):

⚪ Notificaciones push
⚪ Sincronización automática con plataforma
⚪ Machine learning para detectar patrones
⚪ Comparación con otros traders
⚪ Backtesting integrado

10.3 Checklist de Entrega
markdown## 📋 CHECKLIST PRE-LANZAMIENTO

### Parser
- [ ] Detecta correctamente formato de Funding
- [ ] Convierte UTC → BRT sin errores
- [ ] Sugiere agrupación cuando aplica
- [ ] Calcula automáticamente duración
- [ ] Calcula R Planeado y Ejecutado
- [ ] Genera plantilla Telegram completa
- [ ] Genera línea CSV correcta
- [ ] Guarda en storage sin duplicados

### Dashboard - Vista Tabla
- [ ] Muestra todos los trades correctamente
- [ ] Expansión de filas funciona
- [ ] Edición inline guarda cambios
- [ ] Columnas personalizables
- [ ] Ordenamiento por columna funciona
- [ ] Búsqueda/filtrado funciona
- [ ] Paginación (si >50 trades)
- [ ] Resultado en última columna visible

### Dashboard - Vista Bloques
- [ ] Agrupa correctamente por bloques de 10
- [ ] Muestra métricas por bloque
- [ ] Expansión muestra trades del bloque
- [ ] Identifica mejores/peores bloques
- [ ] Gráfico de evolución funciona

### Dashboard - Vista Continuo
- [ ] Métricas globales correctas
- [ ] Equity curve se dibuja bien
- [ ] Progreso de objetivos visible
- [ ] Crecimiento de cuenta calculado
- [ ] Drawdown medido correctamente
- [ ] Proyecciones realistas

### Dashboard - Vista Temporal
- [ ] Análisis mensual/semanal correcto
- [ ] Heat map muestra mejores horas
- [ ] Win rate por símbolo preciso
- [ ] Win rate por dirección preciso
- [ ] Cruce símbolo+dirección correcto
- [ ] Mejores/peores días identificados

### Dashboard - Vista EV
- [ ] Fórmula de EV correcta
- [ ] EV en $ calculado bien
- [ ] EV en R calculado bien
- [ ] EV por símbolo correcto
- [ ] EV por dirección correcto
- [ ] Evolución de EV por bloques
- [ ] Simulaciones funcionan

### Configuración
- [ ] Modal abre/cierra correctamente
- [ ] Objetivos se guardan
- [ ] Franjas horarias personalizables
- [ ] Alertas configurables
- [ ] Capital inicial editable
- [ ] Restaurar defaults funciona

### Alertas
- [ ] Racha perdedora detectada
- [ ] Drawdown elevado alertado
- [ ] Win rate bajo del día alertado
- [ ] Overtrading detectado
- [ ] Objetivo mensual celebrado
- [ ] Bloque exitoso celebrado
- [ ] Alertas se muestran correctamente
- [ ] Dismissable funciona

### Agregar Trade Manual
- [ ] Modal abre correctamente
- [ ] Trade number auto-sugerido
- [ ] Cálculos en tiempo real
- [ ] Validación funciona
- [ ] Guarda sin duplicados
- [ ] Métricas se actualizan
- [ ] Consistencia con parser

### Google Sheets
- [ ] Export CSV genera archivo correcto
- [ ] Import CSV lee correctamente
- [ ] Merge evita duplicados
- [ ] Estructura CSV validada
- [ ] Config exportable/importable
- [ ] Roundtrip sin pérdida de datos

### Storage y Persistencia
- [ ] window.storage persiste refresh
- [ ] Restauración desde CSV funciona
- [ ] No hay pérdida de datos
- [ ] Validación previene corrupción
- [ ] Backup antes de operaciones críticas

### Performance
- [ ] <1s para cargar 100 trades
- [ ] <500ms para renderizar tabla
- [ ] <200ms para cambiar vista
- [ ] Sin lag en scroll
- [ ] Sin memory leaks

### Cross-browser
- [ ] Funciona en Chrome
- [ ] Funciona en Firefox
- [ ] Funciona en Safari
- [ ] Funciona en Edge
- [ ] Mobile responsive (básico)

### Tests
- [ ] Suite de tests pasa al 100%
- [ ] Stress test completado
- [ ] No hay errores en consola
- [ ] Validación de datos exhaustiva
```

---

## 11. RESUMEN EJECUTIVO DEL SISTEMA

### 11.1 Componentes Principales
```
SISTEMA COMPLETO = 3 ARCHIVOS INDEPENDIENTES

1. parser.html (Standalone)
   - Procesa datos de plataforma
   - Genera 3 salidas
   - No requiere servidor

2. dashboard.html (Standalone)
   - 5 vistas completas
   - Sistema de alertas
   - Configuración personalizable
   - No requiere servidor

3. Google Sheet (Backup externo)
   - Almacenamiento permanente
   - Editable manualmente
   - Sincronización bidireccional
```

### 11.2 Flujo de Datos Garantizado
```
ENTRADA → PARSER → 3 DESTINOS
                  ├─ Telegram (reflexión)
                  ├─ Google Sheet (backup permanente)
                  └─ HTML Storage (visualización)

RECUPERACIÓN EN CASO DE PÉRDIDA:
Google Sheet (CSV Export) → Dashboard (Import) → Restauración Completa
11.3 Garantías del Sistema
✅ Persistencia: window.storage sobrevive refresh (NO caché borrado)
✅ Backup: Google Sheet NUNCA se borra automáticamente
✅ Restauración: CSV import restaura 100% de los datos
✅ Consistencia: Validaciones previenen datos corruptos
✅ Anti-duplicados: Order IDs garantizan unicidad
✅ Precisión: R Planeado usado en todas las métricas
✅ Flexibilidad: Agregar trades manual o desde parser
11.4 Métricas Implementadas
Básicas:

Win Rate (%)
R Promedio
P&L Total ($)
Mejor/Peor Trade
Rachas (ganadoras/perdedoras)
Drawdown (actual/máximo)

Avanzadas:

Expected Value ($ y R)
Win Rate cruzado (símbolo + dirección)
Análisis temporal (día, hora, semana, mes)
Heat map de rendimiento
Distribución de R
Evolución por bloques
Desviación de riesgo (planeado vs ejecutado)

Proyecciones:

Crecimiento de cuenta
Simulaciones "¿Qué pasa si...?"
Alcance de objetivos


🎯 DOCUMENTO MAESTRO - FIN
Total de páginas: ~50 páginas de especificación
Total de componentes: 15+ clases JavaScript
Total de vistas: 5 vistas principales + configuración
Total de funciones: 100+ funciones documentadas
Estado del documento: ✅ COMPLETO Y LISTO PARA IMPLEMENTACIÓN
Siguiente paso: ¿Quieres que elabore ahora el DOCUMENTO EDUCATIVO para mejorar tu comprensión de métricas y rendimiento profesional?ReintentarHermano, lo que me estás describiendo es el problema #1 de los traders que SÍ saben leer el mercado pero NO saben gestionar su psicología:
Tienes razón en dirección, pero te autosaboteas en ejecución.

🧠 Por qué este dashboard te va a salvar
Este tipo de plantilla no es solo un documento bonito, espastedMestaba teniendo esta conversacion tambien importante sobre los detalles, del R planeado y R ejecutado, y sobre el volumen, en otro chat, no es necesirio que reescribas todo, ya te enviare una foto de la plantilla que quiero daily, como incorporas esto en el documento sin reescribir todo?Perfecto, entiendo. Voy a actualizar el Documento Maestro agregando estos detalles críticos en las secciones correspondientes sin reescribir todo.
Aquí van las ADICIONES/MODIFICACIONES específicas:

📝 ADDENDUM AL DOCUMENTO MAESTRO
SECCIÓN 2.4.5 - MODIFICACIÓN: Completar Datos Faltantes
AGREGAR después de "Lógica de Trade Number":
javascript// ========================================
// MANEJO INTELIGENTE DE VOLUMEN
// ========================================

function handleMissingVolume(trade) {
  // NIVEL 1: Calcular volume implícito desde P&L (PREFERIDO)
  if (!trade.volume && trade.result) {
    const priceMove = Math.abs(trade.exitPrice - trade.entry);
    trade.volume = Math.abs(trade.result / priceMove);
    trade.volumeCalculated = true;
    trade.volumeSource = 'calculated';
    
    return {
      volume: trade.volume,
      message: `📊 Volume calculado automáticamente: ${trade.volume.toFixed(2)}`
    };
  }
  
  // NIVEL 2: Usar default configurado
  if (!trade.volume && config.defaultVolume) {
    trade.volume = config.defaultVolume;
    trade.volumeAssumed = true;
    trade.volumeSource = 'default';
    
    return {
      volume: trade.volume,
      message: `⚙️ Usando volume default: ${trade.volume}`
    };
  }
  
  // NIVEL 3: Solicitar manual
  return {
    volume: null,
    message: '❓ Volume no detectado. Ingresa manualmente:',
    requiresInput: true
  };
}
AGREGAR en la interfaz HTML:
html<!-- Cuando volume falta -->
<div class="volume-section">
  <h4>📊 Volumen</h4>
  
  <div id="volume-detection">
    <!-- Se llena dinámicamente -->
  </div>
  
  <!-- Opciones según disponibilidad -->
  <div class="volume-options">
    <button onclick="useCalculatedVolume()">
      ✅ Usar calculado (${calculatedVolume})
    </button>
    <button onclick="showManualInput()">
      ✏️ Ingresar manual
    </button>
  </div>
  
  <input type="number" 
         id="manual-volume" 
         style="display:none;" 
         placeholder="Ingresa volume...">
</div>

SECCIÓN 2.4.6 - ADICIÓN: Cálculo de R Planeado vs Ejecutado
AGREGAR explicación detallada:
javascript// ========================================
// R PLANEADO vs R EJECUTADO - EXPLICACIÓN
// ========================================

/*
📌 CONCEPTO CLAVE:

R PLANEADO:
- Lo que TÚ DECIDISTE arriesgar ANTES de entrar
- Refleja tu PROCESO DE DECISIÓN
- Se usa en TODAS las métricas del sistema
- Usuario lo ingresa manualmente

R EJECUTADO:
- Lo que REALMENTE arriesgaste según precio/size
- Cálculo técnico automático
- Solo referencia para validar tu gestión
- Sistema lo calcula automáticamente

¿POR QUÉ USAMOS R PLANEADO?
Porque refleja tu estrategia, no el resultado técnico.

Ejemplo:
- Decidiste arriesgar $100 (R Planeado)
- Por tamaño de posición, arriesgaste $86 (R Ejecutado)
- Ganaste $50

R Planeado = $50 / $100 = 0.5R ← ESTE se usa en métricas
R Ejecutado = $50 / $86 = 0.58R ← Solo referencia

El sistema usa 0.5R porque refleja tu decisión original.
*/

function calculateRMetrics(trade) {
  // 1. CALCULAR RIESGO EJECUTADO (automático)
  if (trade.isGrouped) {
    // Para trades agrupados, sumar riesgo de cada posición
    trade.riskExecuted = trade.positions.reduce((sum, pos) => {
      return sum + Math.abs(pos.entry - trade.stopLoss) * pos.size;
    }, 0);
  } else {
    // Para trades individuales
    trade.riskExecuted = Math.abs(trade.entry - trade.stopLoss) * trade.volume;
  }
  
  // 2. CALCULAR R PLANEADO (lo que decidiste)
  trade.rPlanned = trade.result / trade.riskPlanned;
  
  // 3. CALCULAR R EJECUTADO (referencia técnica)
  trade.rExecuted = trade.result / trade.riskExecuted;
  
  // 4. CALCULAR DESVIACIÓN (qué tan diferente fue tu ejecución)
  trade.riskDeviation = ((trade.riskExecuted - trade.riskPlanned) / trade.riskPlanned) * 100;
  
  // 5. FLAG VISUAL
  trade.riskDeviationFlag = getRiskDeviationFlag(trade.riskDeviation);
  
  return trade;
}

function getRiskDeviationFlag(deviation) {
  if (Math.abs(deviation) < 5) return '✓'; // Ejecución precisa
  if (Math.abs(deviation) < 20) return '⚠'; // Desviación moderada
  return '❌'; // Desviación alta
}
AGREGAR en interfaz del Parser:
html<div class="risk-section">
  <h4>💰 Gestión de Riesgo</h4>
  
  <!-- Campo que USUARIO ingresa -->
  <div class="form-group">
    <label>Riesgo Planeado ($) *</label>
    <input type="number" 
           name="riskPlanned" 
           required
           placeholder="Lo que decidiste arriesgar">
    <small>💡 Lo que decidiste arriesgar ANTES de entrar</small>
  </div>
  
  <!-- Campos calculados automáticamente -->
  <div class="calculated-metrics">
    <h5>📊 Métricas Automáticas</h5>
    
    <div class="metric-row">
      <span>Riesgo Ejecutado:</span>
      <span id="risk-executed">-</span>
      <small>Calculado: |Entry - SL| × Volume</small>
    </div>
    
    <div class="metric-row">
      <span>R Planeado:</span>
      <span id="r-planned">-</span>
      <small>Usado en todas las métricas</small>
    </div>
    
    <div class="metric-row">
      <span>R Ejecutado:</span>
      <span id="r-executed">-</span>
      <small>Solo referencia</small>
    </div>
    
    <div class="metric-row">
      <span>Desviación:</span>
      <span id="deviation">-</span>
      <small>Qué tan precisa fue tu ejecución</small>
    </div>
  </div>
</div>

<script>
// Actualizar métricas en tiempo real
['riskPlanned', 'result', 'entry', 'stopLoss', 'volume'].forEach(field => {
  document.querySelector(`[name="${field}"]`).addEventListener('input', () => {
    updateRiskMetrics();
  });
});

function updateRiskMetrics() {
  const entry = parseFloat(document.querySelector('[name="entry"]').value) || 0;
  const stopLoss = parseFloat(document.querySelector('[name="stopLoss"]').value) || 0;
  const volume = parseFloat(document.querySelector('[name="volume"]').value) || 0;
  const result = parseFloat(document.querySelector('[name="result"]').value) || 0;
  const riskPlanned = parseFloat(document.querySelector('[name="riskPlanned"]').value) || 0;
  
  if (entry && stopLoss && volume) {
    // Riesgo Ejecutado
    const riskExecuted = Math.abs(entry - stopLoss) * volume;
    document.getElementById('risk-executed').textContent = `$${riskExecuted.toFixed(2)}`;
    
    // R Ejecutado
    if (riskExecuted > 0) {
      const rExecuted = result / riskExecuted;
      document.getElementById('r-executed').textContent = `${rExecuted.toFixed(2)}R`;
    }
  }
  
  if (riskPlanned > 0 && result) {
    // R Planeado
    const rPlanned = result / riskPlanned;
    document.getElementById('r-planned').textContent = `${rPlanned.toFixed(2)}R ⭐`;
    
    // Desviación
    if (entry && stopLoss && volume) {
      const riskExecuted = Math.abs(entry - stopLoss) * volume;
      const deviation = ((riskExecuted - riskPlanned) / riskPlanned) * 100;
      const flag = deviation < 5 ? '✓' : deviation < 20 ? '⚠' : '❌';
      
      document.getElementById('deviation').textContent = 
        `${deviation.toFixed(1)}% ${flag}`;
    }
  }
}
</script>

SECCIÓN 5.2 - ADICIÓN: Vista expandida con análisis de R
AGREGAR en renderTradeDetails():
javascript<div class="detail-section risk-analysis-detailed">
  <h4>💰 ANÁLISIS COMPLETO DE RIESGO</h4>
  
  <table class="risk-comparison-table">
    <thead>
      <tr>
        <th></th>
        <th>Valor</th>
        <th>Explicación</th>
      </tr>
    </thead>
    <tbody>
      <tr class="highlight-row">
        <td><strong>Riesgo Planeado</strong></td>
        <td><strong>$${trade.riskPlanned.toFixed(2)}</strong></td>
        <td>✅ Lo que decidiste arriesgar (tu estrategia)</td>
      </tr>
      
      <tr>
        <td>Riesgo Ejecutado</td>
        <td>$${trade.riskExecuted.toFixed(2)}</td>
        <td>📊 Calculado: |${trade.entry} - ${trade.stopLoss}| × ${trade.volume}</td>
      </tr>
      
      <tr class="separator">
        <td colspan="3"><hr></td>
      </tr>
      
      <tr class="highlight-row">
        <td><strong>R Planeado</strong></td>
        <td><strong>${trade.rPlanned.toFixed(2)}R</strong></td>
        <td>⭐ USADO EN MÉTRICAS (${trade.result} / ${trade.riskPlanned})</td>
      </tr>
      
      <tr>
        <td>R Ejecutado</td>
        <td>${trade.rExecuted.toFixed(2)}R</td>
        <td>📈 Referencia (${trade.result} / ${trade.riskExecuted})</td>
      </tr>
      
      <tr class="separator">
        <td colspan="3"><hr></td>
      </tr>
      
      <tr class="${Math.abs(trade.riskDeviation) < 5 ? 'success' : 'warning'}">
        <td>Desviación</td>
        <td>${trade.riskDeviation.toFixed(1)}% ${trade.riskDeviationFlag}</td>
        <td>${getDeviationExplanation(trade.riskDeviation)}</td>
      </tr>
    </tbody>
  </table>
  
  <div class="risk-insight-box">
    <h5>💡 ¿Por qué usamos R Planeado?</h5>
    <p>${getWhyRPlannedExplanation(trade)}</p>
  </div>
</div>

<script>
function getDeviationExplanation(deviation) {
  if (Math.abs(deviation) < 5) {
    return '✅ Ejecución casi perfecta. Planeado ≈ Ejecutado';
  } else if (deviation < 0) {
    return '💡 Arriesgaste MENOS (conservador). R ejecutado mayor pero no refleja tu decisión.';
  } else if (deviation < 20) {
    return '⚠️ Arriesgaste un poco más de lo planeado. Revisa tu size.';
  } else {
    return '❌ Gran desviación. Revisa tu gestión de riesgo.';
  }
}

function getWhyRPlannedExplanation(trade) {
  if (Math.abs(trade.riskDeviation) < 5) {
    return `Tu riesgo planeado ($${trade.riskPlanned}) y ejecutado ($${trade.riskExecuted.toFixed(2)}) fueron casi idénticos. Excelente ejecución.`;
  } else {
    return `Aunque tu riesgo ejecutado fue $${trade.riskExecuted.toFixed(2)}, usamos R Planeado (${trade.rPlanned.toFixed(2)}R) en las métricas porque refleja tu PROCESO DE DECISIÓN original, no el resultado técnico.`;
  }
}
</script>

SECCIÓN 10.3 - ADICIÓN AL CHECKLIST:
AGREGAR en checklist:
markdown### Manejo de Volume
- [ ] Volume se calcula automáticamente desde P&L cuando falta
- [ ] Muestra mensaje claro cuando usa volume calculado
- [ ] Permite override manual si usuario quiere
- [ ] Usa default configurado como fallback
- [ ] Flag `volumeCalculated` o `volumeAssumed` guardado

### Cálculo de R
- [ ] R Planeado calculado correctamente (Resultado / Riesgo Planeado)
- [ ] R Ejecutado calculado correctamente (|Entry-SL| × Volume)
- [ ] Desviación calculada y flaggeada (✓ ⚠ ❌)
- [ ] R Planeado usado en TODAS las métricas
- [ ] R Ejecutado solo como referencia
- [ ] Explicación clara en UI de por qué se usa R Planeado
- [ ] Vista expandida muestra análisis completo de riesgo

NUEVA SECCIÓN: CONFIGURACIÓN DE VOLUME
AGREGAR en Módulo 5 (Configuración):
javascript// En renderObjectivesSection(), AGREGAR:

<h4>⚙️ Configuración de Volume</h4>
<div class="form-group">
  <label>Volume default (cuando no esté disponible)</label>
  <input type="number" 
         name="defaultVolume" 
         value="${config.defaultVolume || 10}" 
         min="0">
  <small>Se usa cuando la plataforma no muestra volume</small>
</div>

<div class="form-group">
  <label>
    <input type="checkbox" 
           name="autoCalculateVolume" 
           ${config.autoCalculateVolume ? 'checked' : ''}>
    Calcular volume automáticamente desde P&L
  </label>
  <small>Si está activado, el sistema calcula volume = |P&L / (Exit - Entry)|</small>
</div>

<div class="form-group">
  <label>
    <input type="checkbox" 
           name="showVolumeFlags" 
           ${config.showVolumeFlags !== false ? 'checked' : ''}>
    Mostrar flags de volume calculado/asumido
  </label>
  <small>Muestra 📊 o ⚙️ cuando volume no vino de plataforma</small>
</div>

📋 RESUMEN DE LOS CAMBIOS
Lo que se agregó:

✅ Sistema de 3 niveles para volume faltante

Calcular desde P&L
Usar default
Input manual


✅ Explicación completa de R Planeado vs Ejecutado

Por qué usamos R Planeado
Cómo se calcula cada uno
Cuándo usar cada uno


✅ Vista expandida mejorada con tabla comparativa

Muestra ambos valores lado a lado
Explica la desviación
Insight sobre ejecución


✅ Configuración de volume en settings

Default configurable
Auto-cálculo opcional
Flags visuales opcionales


✅ Actualización del checklist

Items específicos para volume
Items específicos para R




🎯 INTEGRACIÓN CON DAILY PLAN
Cuando me envíes la foto del Daily Plan, agregaré:

Estructura HTML del formulario
Sistema de guardado en window.storage
Integración con Parser (sidebar reminder)
Botón de impresión optimizado
Validación pre-trade (verificar que plan existe)

Formato de la adición:

NO reescribiré el documento
Agregaré "SECCIÓN 11: DAILY PLAN MODULE"
Con código específico basado en tu plantilla
Integración con los módulos existentes

¿Listo para enviar la foto del Daily Plan? 📋ReintentarMPerfecto, excelente plantilla. Voy a agregar la SECCIÓN 11: DAILY PLAN MODULE al documento maestro.

SECCIÓN 11: DAILY PLAN MODULE
11.1 Propósito
Herramienta de planificación pre-mercado que el trader completa cada mañana para definir:

Análisis del contexto de mercado
Setup específico del día
Niveles clave y alertas
Reglas de "qué NO hacer"
Parámetros de riesgo y circuit breakers

11.2 Estructura del Archivo
Nombre: daily-plan.html (puede integrarse con parser.html como Tab 1)
11.3 Interfaz Completa
html<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Daily Trading Plan</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f7fa;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    .header {
      background: #1e3a5f;
      color: white;
      padding: 20px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header h1 {
      font-size: 24px;
      font-weight: 600;
    }
    
    .date-display {
      background: rgba(255,255,255,0.1);
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .section {
      padding: 30px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .section:last-child {
      border-bottom: none;
    }
    
    .section-header {
      background: #3b82f6;
      color: white;
      padding: 12px 20px;
      margin: -30px -30px 20px -30px;
      font-size: 16px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    
    .form-group input[type="text"],
    .form-group input[type="number"],
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
    }
    
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .levels-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    
    .level-input {
      display: flex;
      flex-direction: column;
    }
    
    .level-input label {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    
    .level-input.resistance label {
      color: #ef4444;
    }
    
    .level-input.support label {
      color: #10b981;
    }
    
    .level-input.pivot label {
      color: #6366f1;
    }
    
    .checkbox-group {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-top: 10px;
    }
    
    .checkbox-group label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: normal;
      text-transform: none;
      cursor: pointer;
    }
    
    .checkbox-group input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    
    .radio-group {
      display: flex;
      gap: 20px;
      margin-top: 10px;
    }
    
    .radio-group label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: normal;
      text-transform: none;
      cursor: pointer;
    }
    
    .circuit-breakers {
      background: #fef3c7;
      border: 2px solid #f59e0b;
      border-radius: 6px;
      padding: 20px;
      margin-top: 15px;
    }
    
    .circuit-breakers h4 {
      color: #92400e;
      margin-bottom: 15px;
      font-size: 14px;
    }
    
    .circuit-breaker-item {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .circuit-breaker-item input[type="checkbox"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
    }
    
    .circuit-breaker-item.critical {
      font-weight: 600;
      color: #991b1b;
    }
    
    .time-restrictions {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 15px;
    }
    
    .template-box {
      background: #f9fafb;
      border-left: 4px solid #3b82f6;
      padding: 20px;
      margin-top: 20px;
    }
    
    .template-box h4 {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 10px;
      font-weight: 600;
    }
    
    .template-box p {
      font-size: 13px;
      line-height: 1.6;
      color: #4b5563;
      margin-bottom: 8px;
    }
    
    .actions {
      padding: 30px;
      background: #f9fafb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
    }
    
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    
    .btn-primary:hover {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    
    .btn-secondary {
      background: white;
      color: #374151;
      border: 1px solid #d1d5db;
    }
    
    .btn-secondary:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }
    
    .status-message {
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
    }
    
    .status-message.success {
      background: #d1fae5;
      color: #065f46;
      border: 1px solid #6ee7b7;
    }
    
    .status-message.warning {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
    }
    
    @media print {
      body {
        padding: 0;
        background: white;
      }
      
      .container {
        box-shadow: none;
      }
      
      .actions {
        display: none;
      }
      
      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>DAILY TRADING PLAN</h1>
      <div class="date-display" id="current-date"></div>
    </div>
    
    <!-- Status Message -->
    <div class="status-message" id="status-message"></div>
    
    <!-- Form -->
    <form id="daily-plan-form">
      
      <!-- Section 1: Pre-Market Analysis -->
      <div class="section">
        <div class="section-header">PRE-MARKET ANALYSIS</div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Market Regime</label>
            <select name="marketRegime" required>
              <option value="">Select...</option>
              <option value="Trend Up">Trend Up</option>
              <option value="Trend Down">Trend Down</option>
              <option value="Range">Range</option>
              <option value="Consolidation">Consolidation</option>
              <option value="High Volatility">High Volatility</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Key Economic Events Today</label>
            <div class="checkbox-group">
              <label><input type="checkbox" name="events" value="CPI/PPI"> CPI/PPI</label>
              <label><input type="checkbox" name="events" value="FOMC"> FOMC</label>
              <label><input type="checkbox" name="events" value="Major Earnings"> Major Earnings</label>
              <label><input type="checkbox" name="events" value="OpEx"> OpEx</label>
              <label><input type="checkbox" name="events" value="Bond Auction"> Bond Auction</label>
              <label><input type="checkbox" name="events" value="Other"> Other</label>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label>Primary Context</label>
          <textarea name="primaryContext" placeholder="e.g. Above weekly pivot, testing monthly R1"></textarea>
        </div>
        
        <div class="form-group">
          <label>Secondary Context</label>
          <textarea name="secondaryContext" placeholder="e.g. End of month rebalancing, FOMC week"></textarea>
        </div>
        
        <div class="form-group">
          <label>Expected Volatility/ATR</label>
          <input type="text" name="expectedVolatility" placeholder="e.g. VIX: 18.5, SPY ATR: 5.2">
        </div>
      </div>
      
      <!-- Section 2: Trading Plan -->
      <div class="section">
        <div class="section-header">TRADING PLAN</div>
        
        <div class="form-group">
          <label>A-Setup for Today</label>
          <textarea name="aSetup" placeholder="Context + Trigger + Invalidation" required></textarea>
        </div>
        
        <div class="form-group">
          <label>Key Levels & Alerts</label>
          <div class="levels-grid">
            <div class="level-input resistance">
              <label>Resistance 2</label>
              <input type="number" step="0.01" name="resistance2" placeholder="0.00">
            </div>
            <div class="level-input resistance">
              <label>Resistance 1</label>
              <input type="number" step="0.01" name="resistance1" placeholder="0.00">
            </div>
            <div class="level-input pivot">
              <label>Pivot</label>
              <input type="number" step="0.01" name="pivot" placeholder="0.00">
            </div>
            <div class="level-input support">
              <label>Support 1</label>
              <input type="number" step="0.01" name="support1" placeholder="0.00">
            </div>
            <div class="level-input support">
              <label>Support 2</label>
              <input type="number" step="0.01" name="support2" placeholder="0.00">
            </div>
            <div class="level-input pivot">
              <label>VWAP/POC</label>
              <input type="number" step="0.01" name="vwapPoc" placeholder="0.00">
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label>What I Will NOT Do Today</label>
          <textarea name="whatNotDo" placeholder="e.g. No revenge trades, no trading during lunch chop, no adding to losers" required></textarea>
        </div>
        
        <div class="form-group">
          <label>Mental State Check</label>
          <div class="radio-group">
            <label><input type="radio" name="mentalState" value="Focused" required> Focused</label>
            <label><input type="radio" name="mentalState" value="Neutral"> Neutral</label>
            <label><input type="radio" name="mentalState" value="Anxious"> Anxious</label>
            <label><input type="radio" name="mentalState" value="Tired"> Tired</label>
          </div>
        </div>
      </div>
      
      <!-- Section 3: Risk Management -->
      <div class="section">
        <div class="section-header">RISK MANAGEMENT</div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Max Daily Loss</label>
            <input type="number" name="maxDailyLoss" placeholder="$" required>
          </div>
          
          <div class="form-group">
            <label>Max Position Size</label>
            <input type="text" name="maxPositionSize" placeholder="shares/contracts">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label>Max # of Trades</label>
            <input type="number" name="maxTrades" value="5" required>
          </div>
          
          <div class="form-group">
            <label>Profit Target</label>
            <input type="number" name="profitTarget" placeholder="$">
          </div>
        </div>
        
        <div class="form-group">
          <label>R per Trade</label>
          <input type="text" name="rPerTrade" placeholder="1%" value="1%">
        </div>
        
        <div class="circuit-breakers">
          <h4>CIRCUIT BREAKERS</h4>
          <div class="circuit-breaker-item">
            <input type="checkbox" name="circuitBreaker1" id="cb1" value="2losses">
            <label for="cb1">2 losses = 30min break</label>
          </div>
          <div class="circuit-breaker-item critical">
            <input type="checkbox" name="circuitBreaker2" id="cb2" value="3losses" checked>
            <label for="cb2">3 losses = done for day</label>
          </div>
          <div class="circuit-breaker-item critical">
            <input type="checkbox" name="circuitBreaker3" id="cb3" value="maxhit" checked>
            <label for="cb3">Daily max hit = close all</label>
          </div>
        </div>
        
        <div class="form-group">
          <label>Time Restrictions</label>
          <div class="time-restrictions">
            <label><input type="checkbox" name="timeRestriction" value="first15min"> No trades first 15min</label>
            <label><input type="checkbox" name="timeRestriction" value="lunch"> No trades 12-1pm</label>
            <label><input type="checkbox" name="timeRestriction" value="flatBy"> Flat by 3:30pm</label>
          </div>
        </div>
      </div>
      
      <!-- Section 4: Setup Execution Template -->
      <div class="section">
        <div class="section-header">SETUP EXECUTION TEMPLATE</div>
        
        <div class="template-box">
          <h4>Context Requirements:</h4>
          <p>HTF level present (weekly/daily/monthly pivot, TPO VAH/VAL/POC), liquidity identified above/below, regime appropriate (not "trend only" for mean reversion)</p>
          
          <h4>Entry Triggers:</h4>
          <p>Price sweep + close back inside range | Footprint shows absorption at level | Delta divergence (fails to confirm new high/low) | Volume climax at extremes</p>
          
          <h4>Invalidation Rules:</h4>
          <p>Break beyond wick extreme by X ticks | Time stop: no movement in 15min | Context change (news, regime shift)</p>
          
          <h4>Position Management:</h4>
          <p>Entry: Market order on reclaim / Limit at retest | Scaling: Add only on first pullback if risk unchanged | Exits: Fixed target (VWAP/POC) or trailing stop on structure break</p>
        </div>
        
        <div class="form-group">
          <label>Today's Specific Setup Notes</label>
          <textarea name="setupNotes" placeholder="Customizations to template for today's market conditions"></textarea>
        </div>
      </div>
    </form>
    
    <!-- Actions -->
    <div class="actions">
      <div style="display: flex; gap: 10px;">
        <button type="button" class="btn btn-secondary" onclick="loadYesterdayPlan()">
          📋 Load Yesterday
        </button>
        <button type="button" class="btn btn-secondary" onclick="clearForm()">
          🔄 Reset
        </button>
      </div>
      
      <div style="display: flex; gap: 10px;">
        <button type="button" class="btn btn-secondary" onclick="window.print()">
          🖨️ Print
        </button>
        <button type="button" class="btn btn-primary" onclick="savePlan()">
          💾 Save Plan
        </button>
      </div>
    </div>
  </div>
  
  <script>
    // ========================================
    // INICIALIZACIÓN
    // ========================================
    
    window.onload = async function() {
      // Mostrar fecha actual
      const today = new Date();
      document.getElementById('current-date').textContent = 
        today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      
      // Cargar plan de hoy si existe
      await loadTodayPlan();
    };
    
    // ========================================
    // GUARDAR PLAN
    // ========================================
    
    async function savePlan() {
      const form = document.getElementById('daily-plan-form');
      
      // Validar campos requeridos
      if (!form.checkValidity()) {
        showMessage('Please fill all required fields', 'warning');
        form.reportValidity();
        return;
      }
      
      const formData = new FormData(form);
      const plan = {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString(),
        
        // Pre-Market Analysis
        marketRegime: formData.get('marketRegime'),
        events: formData.getAll('events'),
        primaryContext: formData.get('primaryContext'),
        secondaryContext: formData.get('secondaryContext'),
        expectedVolatility: formData.get('expectedVolatility'),
        
        // Trading Plan
        aSetup: formData.get('aSetup'),
        levels: {
          resistance2: formData.get('resistance2'),
          resistance1: formData.get('resistance1'),
          pivot: formData.get('pivot'),
          support1: formData.get('support1'),
          support2: formData.get('support2'),
          vwapPoc: formData.get('vwapPoc')
        },
        whatNotDo: formData.get('whatNotDo'),
        mentalState: formData.get('mentalState'),
        
        // Risk Management
        maxDailyLoss: formData.get('maxDailyLoss'),
        maxPositionSize: formData.get('maxPositionSize'),
        maxTrades: formData.get('maxTrades'),
        profitTarget: formData.get('profitTarget'),
        rPerTrade: formData.get('rPerTrade'),
        circuitBreakers: {
          twoLosses: formData.get('circuitBreaker1') === 'on',
          threeLosses: formData.get('circuitBreaker2') === 'on',
          maxHit: formData.get('circuitBreaker3') === 'on'
        },
        timeRestrictions: formData.getAll('timeRestriction'),
        
        // Setup Notes
        setupNotes: formData.get('setupNotes')
      };
      
      try {
        // Guardar en window.storage
        await window.storage.set('daily-plan-today', JSON.stringify(plan));
        
        // Guardar también con fecha como key (historial)
        await window.storage.set(`daily-plan-${plan.date}`, JSON.stringify(plan));
        
        showMessage('✅ Plan saved successfully!', 'success');
        
        // Opcional: Auto-switch a Parser tab si están integrados
        if (window.switchTab) {
          setTimeout(() => {
            if (confirm('Plan saved! Ready to register trades?')) {
              window.switchTab('parser');
            }
          }, 1500);
        }
        
      } catch (error) {
        showMessage('❌ Error saving plan: ' + error.message, 'warning');
      }
    }
    
    // ========================================
    // CARGAR PLAN
    // ========================================
    
    async function loadTodayPlan() {
      try {
        const result = await window.storage.get('daily-plan-today');
        if (result && result.value) {
          const plan = JSON.parse(result.value);
          
          // Verificar si es de hoy
          const today = new Date().toISOString().split('T')[0];
          if (plan.date === today) {
            fillFormWithPlan(plan);
            showMessage('📋 Loaded today\'s plan', 'success');
          }
        }
      } catch (error) {
        console.log('No plan for today');
      }
    }
    
    async function loadYesterdayPlan() {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = `daily-plan-${yesterday.toISOString().split('T')[0]}`;
        
        const result = await window.storage.get(yesterdayKey);
        if (result && result.value) {
          const plan = JSON.parse(result.value);
          
          if (confirm('Load yesterday\'s plan as template?')) {
            fillFormWithPlan(plan);
            showMessage('📋 Loaded yesterday\'s plan', 'success');
          }
        } else {
          showMessage('No plan found for yesterday', 'warning');
        }
      } catch (error) {
        showMessage('Error loading yesterday\'s plan', 'warning');
      }
    }
    
    function fillFormWithPlan(plan) {
      const form = document.getElementById('daily-plan-form');
      
      // Pre-Market Analysis
      form.marketRegime.value = plan.marketRegime || '';
      if (plan.events) {
        plan.events.forEach(event => {
          const checkbox = form.querySelector(`input[name="events"][value="${event}"]`);
          if (checkbox) checkbox.checked = true;
        });
      }
      form.primaryContext.value = plan.primaryContext || '';
      form.secondaryContext.value = plan.secondaryContext || '';
      form.expectedVolatility.value = plan.expectedVolatility || '';
      
      // Trading Plan
      form.aSetup.value = plan.aSetup || '';
      if (plan.levels) {
        form.resistance2.value = plan.levels.resistance2 || '';
        form.resistance1.value = plan.levels.resistance1 || '';
        form.pivot.value = plan.levels.pivot || '';
        form.support1.value = plan.levels.support1 || '';
        form.support2.value = plan.levels.support2 || '';
        form.vwapPoc.value = plan.levels.vwapPoc || '';
      }
      form.whatNotDo.value = plan.whatNotDo || '';
      if (plan.mentalState) {
        const radio = form.querySelector(`input[name="mentalState"][value="${plan.mentalState}"]`);
        if (radio) radio.checked = true;
      }
      
      // Risk Management
      form.maxDailyLoss.value = plan.maxDailyLoss || '';
      form.maxPositionSize.value = plan.maxPositionSize || '';
      form.maxTrades.value = plan.maxTrades || 5;
      form.profitTarget.value = plan.profitTarget || '';
      form.rPerTrade.value = plan.rPerTrade || '1%';
      
      if (plan.circuitBreakers) {
        form.circuitBreaker1.checked = plan.circuitBreakers.twoLosses || false;
        form.circuitBreaker2.checked = plan.circuitBreakers.threeLosses || false;
        form.circuitBreaker3.checked = plan.circuitBreakers.maxHit || false;
      }
      
      if (plan.timeRestrictions) {
        plan.timeRestrictions.forEach(restriction => {
          const checkbox = form.querySelector(`input[name="timeRestriction"][value="${restriction}"]`);
          if (checkbox) checkbox.checked = true;
        });
      }
      
      // Setup Notes
      form.setupNotes.value = plan.setupNotes || '';
    }
    
    function clearForm() {
      if (confirm('Clear all fields?')) {
        document.getElementById('daily-plan-form').reset();
        showMessage('Form cleared', 'success');
      }
    }
    
    // ========================================
    // UTILIDADES
    // ========================================
    
    function showMessage(text, type) {
      const messageEl = document.getElementById('status-message');
      messageEl.textContent = text;
      messageEl.className = `status-message ${type}`;
      messageEl.style.display = 'block';
      
      setTimeout(() => {
        messageEl.style.display = 'none';
      }, 3000);
    }
    
    // Export para integración con Parser
    window.getDailyPlan = async function() {
      const result = await window.storage.get('daily-plan-today');
      return result ? JSON.parse(result.value) : null;
    };
  </script>
</body>
</html>

11.4 Integración con Parser (Sidebar Reminder)
AGREGAR en parser.html cuando están integrados:
javascript// ========================================
// SIDEBAR CON PLAN DEL DÍA
// ========================================

async function renderPlanReminder() {
  const plan = await window.getDailyPlan();
  
  if (!plan) {
    return `
      <div class="plan-reminder warning">
        <h3>⚠️ NO HAY PLAN PARA HOY</h3>
        <p>Debes crear tu Daily Plan primero</p>
        <button onclick="switchTab('plan')" class="btn-primary">
          Crear Plan Ahora
        </button>
      </div>
    `;
  }
  
  return `
    <div class="plan-reminder">
      <h3>📋 TU PLAN DE HOY</h3>
      
      <div class="plan-section">
        <strong>Market Regime:</strong>
        <p>${plan.marketRegime}</p>
      </div>
      
      <div class="plan-section">
        <strong>A-Setup:</strong>
        <p>${plan.aSetup}</p>
      </div>
      
      <div class="plan-section">
        <strong>Max Trades:</strong>
        <p>${plan.maxTrades} trades</p>
      </div>
      
      <div class="plan-section">
        <strong>Max Daily Loss:</strong>
        <p class="highlight">$${plan.maxDailyLoss}</p>
      </div>
      
      <div class="plan-section warning-box">
        <strong>❌ NO HARÉ HOY:</strong>
        <p>${plan.whatNotDo}</p>
      </div>
      
      <div class="circuit-status">
        <h4>🚦 Circuit Breakers:</h4>
        ${plan.circuitBreakers.threeLosses ? '<p>✅ 3 losses = STOP</p>' : ''}
        ${plan.circuitBreakers.maxHit ? '<p>✅ Max loss = STOP</p>' : ''}
      </div>
    </div>
  `;
}

11.5 Validación Pre-Trade
AGREGAR en Parser antes de guardar trade:
javascriptasync function validateAgainstPlan(trade) {
  const plan = await window.getDailyPlan();
  
  if (!plan) {
    return {
      valid: false,
      warning: '⚠️ No has llenado tu Daily Plan. ¿Continuar sin plan?'
    };
  }
  
  const warnings = [];
  
  // Verificar max trades
  const todayTrades = await getTodayTrades();
  if (todayTrades.length >= parseInt(plan.maxTrades)) {
    warnings.push(`Has alcReintentarMContinuarjavascript    warnings.push(`Has alcanzado tu límite de ${plan.maxTrades} trades`);
  }
  
  // Verificar max daily loss
  const todayPnL = todayTrades.reduce((sum, t) => sum + t.result, 0);
  if (todayPnL <= -parseFloat(plan.maxDailyLoss)) {
    warnings.push(`⛔ CIRCUIT BREAKER: Has alcanzado tu max daily loss ($${plan.maxDailyLoss})`);
  }
  
  // Verificar racha perdedora
  const recentLosses = getRecentLosses(todayTrades);
  if (recentLosses >= 3 && plan.circuitBreakers.threeLosses) {
    warnings.push(`⛔ CIRCUIT BREAKER: 3 pérdidas consecutivas. STOP por hoy.`);
  }
  
  // Verificar time restrictions
  const currentHour = new Date().getHours();
  if (plan.timeRestrictions.includes('first15min')) {
    const marketOpen = 9.5; // 9:30am
    const now = currentHour + (new Date().getMinutes() / 60);
    if (now < marketOpen + 0.25) {
      warnings.push('⏰ Aún no han pasado 15min desde la apertura');
    }
  }
  
  if (plan.timeRestrictions.includes('lunch')) {
    if (currentHour >= 12 && currentHour < 13) {
      warnings.push('⏰ Lunch chop (12-1pm). Evita operar ahora.');
    }
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
    criticalStop: warnings.some(w => w.includes('CIRCUIT BREAKER'))
  };
}

// Uso en el parser antes de guardar:
async function processTrade() {
  const trade = extractTradeData();
  
  // VALIDAR CONTRA PLAN
  const validation = await validateAgainstPlan(trade);
  
  if (validation.criticalStop) {
    alert('🚨 CIRCUIT BREAKER ACTIVADO\n\n' + validation.warnings.join('\n') + '\n\nNO puedes registrar más trades hoy.');
    return;
  }
  
  if (!validation.valid) {
    const proceed = confirm(
      '⚠️ ADVERTENCIAS:\n\n' + 
      validation.warnings.join('\n') + 
      '\n\n¿Continuar de todos modos?'
    );
    
    if (!proceed) return;
    
    // Marcar que rompió reglas
    trade.brokeRules = true;
    trade.rulesViolated = validation.warnings;
  }
  
  // Verificar checkbox "Followed Plan"
  const followedPlan = document.getElementById('followed-plan').checked;
  trade.followedPlan = followedPlan;
  
  // Guardar trade
  await StorageAPI.saveTrade(trade);
  
  showNotification('✅ Trade guardado', 'success');
}

11.6 Análisis Post-Día: Plan vs Realidad
AGREGAR nueva vista en Dashboard:
javascriptclass DailyReview {
  constructor(trades, plan) {
    this.trades = trades;
    this.plan = plan;
  }
  
  render() {
    const todayTrades = this.getTodayTrades();
    const analysis = this.analyzePlanCompliance(todayTrades);
    
    return `
      <div class="daily-review">
        <h2>📊 REVISIÓN DEL DÍA - Plan vs Realidad</h2>
        
        ${this.renderPlanSummary()}
        
        ${this.renderComplianceMetrics(analysis)}
        
        ${this.renderTradesList(todayTrades)}
        
        ${this.renderInsights(analysis)}
      </div>
    `;
  }
  
  renderPlanSummary() {
    return `
      <div class="plan-summary">
        <h3>📋 TU PLAN DE HOY</h3>
        
        <div class="plan-grid">
          <div class="plan-item">
            <strong>Market Regime:</strong>
            <span>${this.plan.marketRegime}</span>
          </div>
          
          <div class="plan-item">
            <strong>A-Setup:</strong>
            <span>${this.plan.aSetup}</span>
          </div>
          
          <div class="plan-item">
            <strong>Max Trades:</strong>
            <span>${this.plan.maxTrades}</span>
          </div>
          
          <div class="plan-item">
            <strong>Max Loss:</strong>
            <span>$${this.plan.maxDailyLoss}</span>
          </div>
          
          <div class="plan-item">
            <strong>Mental State:</strong>
            <span>${this.plan.mentalState}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  renderComplianceMetrics(analysis) {
    return `
      <div class="compliance-metrics">
        <h3>✅ CUMPLIMIENTO DEL PLAN</h3>
        
        <div class="metrics-grid">
          <div class="metric-card ${analysis.tradesWithinLimit ? 'success' : 'danger'}">
            <div class="metric-label">Trades Realizados</div>
            <div class="metric-value">${analysis.actualTrades} / ${this.plan.maxTrades}</div>
            <div class="metric-status">
              ${analysis.tradesWithinLimit ? '✅ Dentro del límite' : '❌ Excediste el límite'}
            </div>
          </div>
          
          <div class="metric-card ${analysis.lossWithinLimit ? 'success' : 'danger'}">
            <div class="metric-label">Pérdida del Día</div>
            <div class="metric-value">${analysis.actualLoss >= 0 ? '+' : ''}$${analysis.actualLoss.toFixed(2)}</div>
            <div class="metric-status">
              ${analysis.lossWithinLimit ? '✅ Bajo control' : '❌ Superaste max loss'}
            </div>
          </div>
          
          <div class="metric-card ${analysis.followedPlanPercent >= 80 ? 'success' : 'warning'}">
            <div class="metric-label">Siguió Plan</div>
            <div class="metric-value">${analysis.tradesFollowedPlan} / ${analysis.actualTrades}</div>
            <div class="metric-status">${analysis.followedPlanPercent.toFixed(0)}%</div>
          </div>
          
          <div class="metric-card ${analysis.brokeRulesCount === 0 ? 'success' : 'danger'}">
            <div class="metric-label">Reglas Rotas</div>
            <div class="metric-value">${analysis.brokeRulesCount}</div>
            <div class="metric-status">
              ${analysis.brokeRulesCount === 0 ? '✅ Ninguna' : `❌ ${analysis.brokeRulesCount} veces`}
            </div>
          </div>
        </div>
      </div>
    `;
  }ReintentarMESO  de nueva vista en el dash noPerfecto, entendido. NO agregar nueva vista en el Dashboard.
Voy a corregir la Sección 11.6 para que sea solo un análisis automático que se muestra en la Vista 1 (Tabla) cuando hay trades del día:

11.6 Análisis Plan vs Realidad (Integrado en Vista 1)
MODIFICAR en Vista 1 (Tabla de Trades) - Agregar banner superior:
javascript// En TradeTable.render(), AGREGAR antes de renderizar la tabla:

async function renderDailyComplianceBanner() {
  const plan = await window.getDailyPlan();
  if (!plan) return '';
  
  const todayTrades = this.getTodayTrades();
  if (todayTrades.length === 0) return '';
  
  const analysis = analyzePlanCompliance(todayTrades, plan);
  
  return `
    <div class="compliance-banner ${analysis.overallStatus}">
      <div class="banner-header">
        <h3>📋 Plan del Día - Cumplimiento</h3>
        <span class="date">${formatDate(new Date())}</span>
      </div>
      
      <div class="compliance-stats">
        <div class="stat ${analysis.tradesWithinLimit ? 'ok' : 'alert'}">
          <span class="label">Trades:</span>
          <span class="value">${todayTrades.length}/${plan.maxTrades}</span>
          ${analysis.tradesWithinLimit ? '✅' : '⚠️'}
        </div>
        
        <div class="stat ${analysis.lossWithinLimit ? 'ok' : 'alert'}">
          <span class="label">P&L:</span>
          <span class="value">${analysis.totalPnL >= 0 ? '+' : ''}$${analysis.totalPnL.toFixed(2)}</span>
          ${analysis.lossWithinLimit ? '✅' : '🚨'}
        </div>
        
        <div class="stat ${analysis.followedPlanPercent >= 80 ? 'ok' : 'warning'}">
          <span class="label">Siguió Plan:</span>
          <span class="value">${analysis.tradesFollowedPlan}/${todayTrades.length}</span>
          ${analysis.followedPlanPercent >= 80 ? '✅' : '⚠️'}
        </div>
        
        <div class="stat ${analysis.brokeRulesCount === 0 ? 'ok' : 'alert'}">
          <span class="label">Reglas Rotas:</span>
          <span class="value">${analysis.brokeRulesCount}</span>
          ${analysis.brokeRulesCount === 0 ? '✅' : '❌'}
        </div>
      </div>
      
      ${analysis.circuitBreakerActive ? `
        <div class="circuit-alert">
          🚨 CIRCUIT BREAKER ACTIVADO - No registres más trades hoy
        </div>
      ` : ''}
    </div>
  `;
}

function analyzePlanCompliance(trades, plan) {
  const totalPnL = trades.reduce((sum, t) => sum + t.result, 0);
  const tradesFollowedPlan = trades.filter(t => t.followedPlan).length;
  const brokeRulesCount = trades.filter(t => t.brokeRules).length;
  
  const tradesWithinLimit = trades.length <= parseInt(plan.maxTrades);
  const lossWithinLimit = totalPnL > -parseFloat(plan.maxDailyLoss);
  const followedPlanPercent = (tradesFollowedPlan / trades.length) * 100;
  
  // Verificar circuit breakers
  const recentLosses = getConsecutiveLosses(trades);
  const circuitBreakerActive = 
    !lossWithinLimit || 
    (recentLosses >= 3 && plan.circuitBreakers.threeLosses);
  
  // Status general
  let overallStatus = 'ok';
  if (circuitBreakerActive) overallStatus = 'critical';
  else if (!tradesWithinLimit || brokeRulesCount > 0) overallStatus = 'warning';
  
  return {
    totalPnL,
    tradesFollowedPlan,
    brokeRulesCount,
    tradesWithinLimit,
    lossWithinLimit,
    followedPlanPercent,
    circuitBreakerActive,
    overallStatus
  };
}

function getConsecutiveLosses(trades) {
  let losses = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].result <= 0) losses++;
    else break;
  }
  return losses;
}
CSS para el banner:
css.compliance-banner {
  background: white;
  border-left: 4px solid #10b981;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.compliance-banner.warning {
  border-left-color: #f59e0b;
  background: #fffbeb;
}

.compliance-banner.critical {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.banner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.banner-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.compliance-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.stat.ok {
  border-color: #10b981;
  background: #f0fdf4;
}

.stat.warning {
  border-color: #f59e0b;
  background: #fffbeb;
}

.stat.alert {
  border-color: #ef4444;
  background: #fef2f2;
}

.stat .label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.stat .value {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.circuit-alert {
  margin-top: 15px;
  padding: 12px;
  background: #fee2e2;
  border: 2px solid #ef4444;
  border-radius: 6px;
  color: #991b1b;
  font-weight: 600;
  text-align: center;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

---

### **11.7 Resumen de Integración Daily Plan**

**Flujo completo:**
```
1. MAÑANA (daily-plan.html o Tab 1):
   ├─ Usuario llena plan
   ├─ Click "Save Plan"
   ├─ Se guarda en window.storage['daily-plan-today']
   └─ Opcionalmente imprime o deja pestaña abierta

2. DURANTE EL DÍA (parser.html o Tab 2):
   ├─ Sidebar muestra resumen del plan
   ├─ Al registrar trade:
   │  ├─ Valida contra plan (max trades, max loss, etc.)
   │  ├─ Muestra warnings si procede
   │  ├─ Bloquea si circuit breaker activo
   │  └─ Usuario marca checkbox "Followed Plan"
   └─ Trade se guarda con flags (followedPlan, brokeRules)

3. REVISIÓN (dashboard.html Vista 1):
   ├─ Banner superior muestra cumplimiento del día
   ├─ Stats: Trades, P&L, Plan seguido, Reglas rotas
   ├─ Alert visual si circuit breaker activo
   └─ Tabla normal debajo con todos los trades

11.8 Checklist de Daily Plan
AGREGAR a Sección 10.3:
markdown### Daily Plan Module
- [ ] Formulario completo con todas las secciones
- [ ] Guarda en window.storage['daily-plan-today']
- [ ] Guarda historial con fecha como key
- [ ] Botón "Load Yesterday" funciona
- [ ] Botón "Print" optimizado para impresión
- [ ] Fecha automática en header
- [ ] Validación de campos requeridos

### Integración Parser-Plan
- [ ] Sidebar muestra resumen del plan en Parser
- [ ] Valida max trades antes de guardar
- [ ] Valida max loss antes de guardar
- [ ] Valida time restrictions
- [ ] Detecta circuit breakers (3 losses, max loss)
- [ ] Checkbox "Followed Plan" funcional
- [ ] Flag brokeRules se guarda correctamente

### Compliance Banner (Vista 1)
- [ ] Aparece solo si hay trades del día
- [ ] Muestra stats correctos (Trades, P&L, Plan, Reglas)
- [ ] Cambia color según status (ok/warning/critical)
- [ ] Alert de circuit breaker visible y animado
- [ ] No interfiere con tabla de trades

✅ RESUMEN DE ADICIONES AL DOCUMENTO MAESTRO
Lo que agregamos SIN reescribir todo:

✅ Sección 2.4.5: Manejo inteligente de Volume (3 niveles)
✅ Sección 2.4.6: Explicación R Planeado vs Ejecutado
✅ Sección 5.2: Vista expandida con análisis de riesgo
✅ Sección 5 (Config): Configuración de Volume
✅ Sección 10.3: Checklist actualizado
✅ NUEVA Sección 11: Daily Plan Module completo

11.1: Propósito
11.2: Estructura
11.3: Interfaz HTML completa
11.4: Integración con Parser (Sidebar)
11.5: Validación Pre-Trade
11.6: Banner de Compliance (Vista 1)
11.7: Resumen de Integración
11.8: Checklist




🎯 ESTADO DEL DOCUMENTO MAESTRO
COMPLETO Y LISTO con:

✅ Parser Dual (Telegram + Sheet)
✅ Sistema de Almacenamiento
✅ Dashboard (5 Vistas)
✅ Configuración
✅ Alertas
✅ Daily Plan Module
✅ Manejo de Volume faltante
✅ R Planeado vs Ejecutado
✅ Integración completa

Total: ~60 páginas de especificación técnica completa
¿Procedo ahora con el DOCUMENTO EDUCATIVO para mejorar tu comprensión de métricas profesionales? 📚Reintentar10.3 Checklist de Entrega
markdown## 📋 CHECKLIST PRE-LANZAMIENTO

### Parser
- [ ] Detecta correctamente formato de Funding
- [ ] Convierte UTC → BRT sin errores
- [ ] Sugiere agrupación cuando aplica
- [ ] Calcula automáticamente duración
- [ ] Calcula R Planeado y Ejecutado
- [ ] Genera plantillapastedMvamos a proceder a armar la estructura, de ultimo el documento, falta que agregues lo nuevo que agregamos recienPerfecto, voy a actualizar la Sección 10.3 y 11 con lo nuevo que agregamos (Daily Plan, Volume, R Planeado/Ejecutado):

10.3 CHECKLIST PRE-LANZAMIENTO (ACTUALIZADO)
markdown## 📋 CHECKLIST PRE-LANZAMIENTO

### Parser
- [ ] Detecta correctamente formato de Funding
- [ ] Convierte UTC → BRT sin errores
- [ ] Sugiere agrupación cuando aplica
- [ ] Calcula automáticamente duración
- [ ] Calcula R Planeado y Ejecutado
- [ ] Genera plantilla Telegram completa
- [ ] Genera línea CSV correcta
- [ ] Guarda en storage sin duplicados

### Manejo de Volume
- [ ] Volume se calcula automáticamente desde P&L cuando falta
- [ ] Muestra mensaje claro cuando usa volume calculado
- [ ] Permite override manual si usuario quiere
- [ ] Usa default configurado como fallback
- [ ] Flag `volumeCalculated` o `volumeAssumed` guardado correctamente
- [ ] Visual indicator (📊 ⚙️) cuando volume no viene de plataforma

### Cálculo de R
- [ ] R Planeado calculado correctamente (Resultado / Riesgo Planeado)
- [ ] R Ejecutado calculado correctamente (|Entry-SL| × Volume)
- [ ] Desviación calculada y flaggeada (✓ ⚠ ❌)
- [ ] R Planeado usado en TODAS las métricas del sistema
- [ ] R Ejecutado mostrado solo como referencia
- [ ] Explicación clara en UI de por qué se usa R Planeado
- [ ] Vista expandida muestra tabla comparativa de riesgo
- [ ] Insight automático sobre desviación de riesgo

### Dashboard - Vista Tabla
- [ ] Muestra todos los trades correctamente
- [ ] Expansión de filas funciona
- [ ] Edición inline guarda cambios
- [ ] Columnas personalizables
- [ ] Ordenamiento por columna funciona
- [ ] Búsqueda/filtrado funciona
- [ ] Paginación (si >50 trades)
- [ ] Resultado en última columna visible
- [ ] Banner de compliance del día visible (si hay trades hoy)
- [ ] Stats de cumplimiento de plan actualizadas

### Dashboard - Vista Bloques
- [ ] Agrupa correctamente por bloques de 10
- [ ] Muestra métricas por bloque
- [ ] Expansión muestra trades del bloque
- [ ] Identifica mejores/peores bloques
- [ ] Gráfico de evolución funciona

### Dashboard - Vista Continuo
- [ ] Métricas globales correctas
- [ ] Equity curve se dibuja bien
- [ ] Progreso de objetivos visible
- [ ] Crecimiento de cuenta calculado
- [ ] Drawdown medido correctamente
- [ ] Proyecciones realistas

### Dashboard - Vista Temporal
- [ ] Análisis mensual/semanal correcto
- [ ] Heat map muestra mejores horas
- [ ] Win rate por símbolo preciso
- [ ] Win rate por dirección preciso
- [ ] Cruce símbolo+dirección correcto
- [ ] Mejores/peores días identificados

### Dashboard - Vista EV
- [ ] Fórmula de EV correcta
- [ ] EV en $ calculado bien
- [ ] EV en R calculado bien
- [ ] EV por símbolo correcto
- [ ] EV por dirección correcto
- [ ] Evolución de EV por bloques
- [ ] Simulaciones funcionan

### Daily Plan Module
- [ ] Formulario completo con todas las secciones (Pre-Market, Trading Plan, Risk, Setup)
- [ ] Guarda en window.storage['daily-plan-today']
- [ ] Guarda historial con fecha como key (daily-plan-YYYY-MM-DD)
- [ ] Botón "Load Yesterday" funciona correctamente
- [ ] Botón "Print" optimizado para impresión (oculta navegación)
- [ ] Fecha automática en header actualizada
- [ ] Validación de campos requeridos (marketRegime, aSetup, maxDailyLoss, etc.)
- [ ] Circuit breakers checkboxes funcionan
- [ ] Time restrictions checkboxes funcionan
- [ ] Mental state radio buttons funcionan
- [ ] Key levels (resistances, supports, pivot) se guardan

### Integración Parser-Plan
- [ ] Sidebar muestra resumen del plan en Parser
- [ ] Warning si no hay plan del día al intentar registrar trade
- [ ] Valida max trades antes de guardar
- [ ] Valida max loss acumulado antes de guardar
- [ ] Valida time restrictions (first 15min, lunch, flat by 3:30pm)
- [ ] Detecta circuit breakers (3 losses consecutivas, max loss hit)
- [ ] Bloquea registro si circuit breaker crítico activo
- [ ] Checkbox "Followed Plan" funcional y requerido
- [ ] Flag brokeRules se guarda correctamente
- [ ] Lista de reglas violadas (rulesViolated) guardada

### Compliance Banner (Vista 1)
- [ ] Aparece solo si hay trades del día y plan existe
- [ ] Muestra stats correctos (Trades realizados vs max, P&L vs max loss)
- [ ] Muestra % de trades que siguieron el plan
- [ ] Muestra cantidad de reglas rotas
- [ ] Cambia color según status (ok=verde, warning=amarillo, critical=rojo)
- [ ] Alert de circuit breaker visible y animado si está activo
- [ ] No interfiere con tabla de trades (banner superior separado)
- [ ] Responsive en diferentes tamaños de pantalla

### Configuración
- [ ] Modal abre/cierra correctamente
- [ ] Objetivos se guardan
- [ ] Franjas horarias personalizables
- [ ] Alertas configurables
- [ ] Capital inicial editable
- [ ] Restaurar defaults funciona
- [ ] Configuración de volume default guardada
- [ ] Toggle "auto-calculate volume" funciona
- [ ] Toggle "show volume flags" funciona

### Alertas
- [ ] Racha perdedora detectada
- [ ] Drawdown elevado alertado
- [ ] Win rate bajo del día alertado
- [ ] Overtrading detectado
- [ ] Objetivo mensual celebrado
- [ ] Bloque exitoso celebrado
- [ ] Alertas se muestran correctamente
- [ ] Dismissable funciona

### Agregar Trade Manual
- [ ] Modal abre correctamente
- [ ] Trade number auto-sugerido
- [ ] Cálculos en tiempo real (R Plan, R Exec, Desviación)
- [ ] Validación funciona
- [ ] Guarda sin duplicados
- [ ] Métricas se actualizan al instante
- [ ] Consistencia con parser (mismo formato de datos)

### Google Sheets
- [ ] Export CSV genera archivo correcto
- [ ] Import CSV lee correctamente
- [ ] Merge evita duplicados por Order ID
- [ ] Estructura CSV validada
- [ ] Config exportable/importable
- [ ] Roundtrip sin pérdida de datos
- [ ] Volume calculado/asumido se exporta con flag

### Storage y Persistencia
- [ ] window.storage persiste refresh
- [ ] Restauración desde CSV funciona
- [ ] No hay pérdida de datos
- [ ] Validación previene corrupción
- [ ] Backup antes de operaciones críticas
- [ ] daily-plan-today se guarda correctamente
- [ ] Historial de planes por fecha se mantiene
- [ ] Storage keys separados (trades-data, daily-plan, config, alerts-state)

### Performance
- [ ] <1s para cargar 100 trades
- [ ] <500ms para renderizar tabla
- [ ] <200ms para cambiar vista
- [ ] Sin lag en scroll
- [ ] Sin memory leaks
- [ ] Daily Plan carga instantáneamente (<100ms)
- [ ] Validación pre-trade no causa delay perceptible

### Cross-browser
- [ ] Funciona en Chrome
- [ ] Funciona en Firefox
- [ ] Funciona en Safari
- [ ] Funciona en Edge
- [ ] Mobile responsive (básico)
- [ ] Daily Plan imprimible en todos los browsers

### Tests
- [ ] Suite de tests pasa al 100%
- [ ] Stress test completado
- [ ] No hay errores en consola
- [ ] Validación de datos exhaustiva
- [ ] Test de volume calculation con diferentes escenarios
- [ ] Test de validación contra plan (todos los circuit breakers)
- [ ] Test de merge CSV con duplicados
```

---

## **11. RESUMEN EJECUTIVO DEL SISTEMA (ACTUALIZADO)**

### 11.1 Componentes Principales
```
SISTEMA COMPLETO = 4 COMPONENTES INTEGRADOS

1. daily-plan.html (Pre-Trading)
   - Planificación matutina
   - Define setup del día
   - Circuit breakers y reglas
   - Imprimible
   - Se integra con Parser (Tab 1 opcional)

2. parser.html (Post-Trading)
   - Procesa datos de plataforma
   - Genera 3 salidas
   - Valida contra Daily Plan
   - Calcula R Planeado/Ejecutado
   - Manejo inteligente de volume
   - No requiere servidor

3. dashboard.html (Análisis)
   - 5 vistas completas
   - Sistema de alertas
   - Configuración personalizable
   - Compliance banner (Plan vs Realidad)
   - No requiere servidor

4. Google Sheet (Backup externo)
   - Almacenamiento permanente
   - Editable manualmente
   - Sincronización bidireccional
   - Recuperación garantizada
```

### 11.2 Flujo de Datos Garantizado
```
PRE-TRADING:
Daily Plan → window.storage['daily-plan-today']

DURANTE TRADING:
Alertas TradingView → Usuario espera setup

POST-TRADE:
ENTRADA → PARSER → Validación vs Plan → 3 DESTINOS
                                       ├─ Telegram (reflexión)
                                       ├─ Google Sheet (backup permanente)
                                       └─ HTML Storage (visualización)
                                             ↓
                                       DASHBOARD
                                       └─ 5 Vistas + Compliance Banner

RECUPERACIÓN EN CASO DE PÉRDIDA:
Google Sheet (CSV Export) → Dashboard (Import) → Restauración Completa
11.3 Garantías del Sistema
✅ Persistencia:

window.storage sobrevive refresh (NO caché borrado)
Daily Plan independiente de trades
Historial de planes por fecha

✅ Backup:

Google Sheet NUNCA se borra automáticamente
Export/Import CSV sin pérdida de datos
Volume calculado se preserva con flags

✅ Restauración:

CSV import restaura 100% de los datos
Merge inteligente evita duplicados
Config y planes restaurables

✅ Consistencia:

Validaciones previenen datos corruptos
Anti-duplicados por Order IDs
Storage keys separados (sin conflictos)

✅ Precisión:

R Planeado usado en TODAS las métricas
R Ejecutado solo como referencia técnica
Volume calculado automáticamente si falta

✅ Disciplina:

Daily Plan obliga a planear ANTES de operar
Validación pre-trade contra plan
Circuit breakers automáticos
Compliance tracking diario

✅ Flexibilidad:

Agregar trades manual o desde parser
Impresión optimizada del Daily Plan
Configuración completa personalizable

11.4 Métricas Implementadas
Básicas:

Win Rate (%)
R Promedio (basado en R Planeado)
P&L Total ($)
Mejor/Peor Trade
Rachas (ganadoras/perdedoras)
Drawdown (actual/máximo)

Avanzadas:

Expected Value ($ y R)
Win Rate cruzado (símbolo + dirección)
Análisis temporal (día, hora, semana, mes)
Heat map de rendimiento
Distribución de R
Evolución por bloques
Desviación de riesgo (planeado vs ejecutado)

Disciplina:

% Trades que siguieron plan
Cantidad de reglas rotas
Circuit breakers activados
Compliance diario vs objetivos

Proyecciones:

Crecimiento de cuenta
Simulaciones "¿Qué pasa si...?"
Alcance de objetivos mensuales

11.5 Arquitectura de Storage
javascriptwindow.storage {
  // Trades
  'trades-data': {
    version: '1.0',
    totalTrades: 36,
    lastUpdated: '2025-11-05T...',
    trades: [...]
  },
  
  // Daily Plan (hoy)
  'daily-plan-today': {
    date: '2025-11-05',
    marketRegime: 'Trend Up',
    aSetup: '...',
    maxTrades: 5,
    maxDailyLoss: 500,
    // ... más campos
  },
  
  // Historial de planes
  'daily-plan-2025-11-04': {...},
  'daily-plan-2025-11-03': {...},
  
  // Configuración
  'config': {
    timezone: 'America/Sao_Paulo',
    capitalInicial: 10000,
    defaultVolume: 10,
    autoCalculateVolume: true,
    objectives: {...},
    alerts: {...}
  },
  
  // Estado de alertas
  'alerts-state': {
    'goal-achieved-11': true,
    'block-success-3': true,
    // ... alertas mostradas
  }
}
```

### 11.6 Flujo Diario Completo
```
🌅 MAÑANA (5-10 min):
1. Abrir daily-plan.html (o Tab 1)
2. Llenar análisis pre-mercado
3. Definir A-Setup del día
4. Marcar niveles clave
5. Escribir "What I will NOT do today"
6. Configurar circuit breakers
7. [Save Plan]
8. Opcional: Imprimir o dejar pestaña abierta

📊 ANTES DE OPERAR:
1. Configurar alertas en TradingView
2. Alejar del gráfico
3. Esperar setup definido en plan

💼 DESPUÉS DE TRADE:
1. Abrir parser.html (o Tab 2)
2. Pegar datos de plataforma
3. Sistema detecta formato y calcula todo
4. Completar: SL, TP, Riesgo Planeado
5. Sistema valida contra plan:
   - Max trades
   - Max loss
   - Time restrictions
   - Circuit breakers
6. Marcar ✅ "Followed Plan"
7. [Save Trade]
8. Trade aparece en Dashboard instantáneamente

📈 ANÁLISIS (cuando quieras):
1. Abrir dashboard.html
2. Vista 1: Ver compliance del día + tabla completa
3. Vista 2: Análisis por bloques
4. Vista 3: Equity curve y progreso
5. Vista 4: Heat map y mejores horas
6. Vista 5: Expected Value y simulaciones

🔄 SINCRONIZACIÓN (cada bloque o semana):
1. Dashboard → Export CSV
2. Pegar en Google Sheet
3. Backup permanente creado

🎯 ESTADO FINAL DEL DOCUMENTO MAESTRO
COMPLETAMENTE ACTUALIZADO con:

✅ Parser Dual (Telegram + Sheet)
✅ Sistema de Almacenamiento (4 keys separados)
✅ Dashboard (5 Vistas)
✅ Configuración completa
✅ Alertas visuales
✅ Daily Plan Module (completo)
✅ Manejo inteligente de Volume (3 niveles)
✅ R Planeado vs Ejecutado (explicación completa)
✅ Validación pre-trade contra plan
✅ Circuit breakers automáticos
✅ Compliance tracking diario
✅ Integración completa entre todos los módulos

Total: ~65 páginas de especificación técnica completa

🚀 SIGUIENTE PASO: EMPEZAR A CREAR LOS ARCHIVOS

