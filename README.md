# Aplicación de Finanzas con Google Sheets

# 📊 App de Análisis Financiero

Aplicación para analizar datos financieros desde Google Sheets.

## Estructura Completa

```
finanzas_app/
├── src/
│   ├── __init__.py
│   ├── google_sheets_client.py
│   ├── data_processor.py
│   └── visualizations.py
├── config/
│   └── credentials.json
├── analisis_finanzas.ipynb
├── requirements.txt
├── .env
└── README.md
├── core/                          # Lógica de negocio
│   ├── database/
│   │   ├── manager.py            # Gestor de base de datos
│   │   ├── models.py             # Modelos de datos
│   │   └── migrations/           # Migraciones de BD
│   ├── services/
│   │   ├── google_sheets.py      # Integración Google Sheets
│   │   ├── data_processor.py     # Procesamiento de datos
│   │   ├── analytics.py          # Análisis y métricas
│   │   └── recommendations.py    # Sistema de recomendaciones
│   └── utils/
│       ├── validators.py         # Validación de datos
│       ├── exporters.py          # Exportación de datos
│       └── helpers.py            # Utilidades generales
├── ui/                           # Interfaz de usuario
│   ├── main_window.py           # Ventana principal
│   ├── widgets/
│   │   ├── dashboard.py         # Dashboard principal
│   │   ├── expense_form.py      # Formulario de gastos
│   │   ├── income_form.py       # Formulario de ingresos
│   │   ├── products_manager.py  # Gestor de productos
│   │   ├── monthly_control.py   # Control mensual
│   │   └── charts.py            # Gráficos interactivos
│   ├── components/
│   │   ├── tables.py            # Tablas editables
│   │   ├── filters.py           # Sistema de filtros
│   │   └── dialogs.py           # Diálogos y modales
│   └── styles/
│       └── themes.py            # Temas y estilos
├── data/                         # Datos locales
│   ├── database.db              # SQLite principal
│   ├── backups/                 # Backups automáticos
│   └── exports/                 # Archivos exportados
├── config/                      # Configuración
│   ├── settings.json           # Configuración de la app
│   ├── categories.json         # Categorías predefinidas
│   └── credentials/            # Credenciales (opcional)
└── main.py                     # Punto de entrada
```

## 🚀 Configuración Rápida

1. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configurar credenciales:**
   - Descarga `credentials.json` de Google Cloud Console
   - Colócalo en `config/credentials.json`

3. **Configurar variables:**
   - Edita `.env` con tu SPREADSHEET_ID

4. **Compartir Google Sheet:**
   - Comparte tu sheet con el email de la cuenta de servicio

5. **Ejecutar:**
   ```bash
   jupyter notebook notebooks/analisis_finanzas.ipynb
   ```

## 📁 Estructura

- `src/` - Código fuente de la aplicación
- `notebooks/` - Jupyter notebooks para análisis
- `config/` - Archivos de configuración
- `.env` - Variables de entorno

## 📊 Gráficos Disponibles

- Evolución mensual de finanzas
- Gastos por categoría
- Tendencia de ahorro
- Comparativo mensual
- Top gastos individuales

## TABLAS DE ANÁLISIS:

# gastos

-- COLUMNAS PRINCIPALES
id_gasto (PK)
fecha_compra
fecha_registro
establecimiento
ubicacion_establecimiento
total_compra
moneda
tipo_pago
fuente_pago
descuento_aplicado
impuestos
numero_cuotas (si crédito)
interes_aplicado
categoria_compra
subcategoria_compra
tipo_gasto ['esencial', 'confort', 'lujo', 'inversion']
urgencia_compra ['necesario', 'planificado', 'impulso']
emocion_compra ['alegria', 'estres', 'neutral', 'arrepentimiento']
motivo_compra (texto libre)
comentarios_compra
etiquetas (array)
personas_afectadas (array)
temporada ['normal', 'navidad', 'vacaciones', 'especial']
es_recurrente (boolean)
frecuencia_recurrencia ['diaria', 'semanal', 'mensual', 'anual']

# productos_comprados

-- COLUMNAS PRINCIPALES  
id_producto (PK)
id_gasto (FK) -- Relación con la compra
nombre_producto
marca
modelo (opcional)
categoria_producto
subcategoria_producto
cantidad_comprada
unidad_medida ['unidades', 'kg', 'litros', 'metros', 'paquete']
precio_unitario
precio_total
fecha_vencimiento (si aplica)
lote_numero (si aplica)
garantia_hasta (si aplica)
condicion_producto ['nuevo', 'usado', 'reacondicionado']
tipo_producto ['consumible', 'durable', 'servicio', 'digital']
tiempo_esperado_vida (días estimados)
notas_producto

# consumo_productos

-- COLUMNAS PRINCIPALES
id_consumo (PK)
id_producto (FK)
fecha_inicio_uso
fecha_fin_uso (null si aún en uso)
estado_actual ['nuevo', 'en_uso', 'agotado', 'descartado', 'donado', 'vendido']
cantidad_consumida (unidades/volumen usado)
unidad_consumo
frecuencia_uso ['diario', 'semanal', 'mensual', 'ocasional']
intensidad_uso ['baja', 'media', 'alta', 'intensiva']
modo_uso (texto) -- "Para el desayuno", "En el baño", etc.
ubicacion_uso (texto) -- "Cocina", "Oficina", "Auto"
persona_principal_uso
efectividad_producto (1-5)
facilidad_uso (1-5)
problemas_detectados (array) -- ['mala_calidad', 'dificil_uso', 'cara_mantenimiento']
fecha_proximo_reemplazo_estimado
razon_fin_uso ['agotado', 'fallo', 'mejora', 'cambio_gusto']

# evaluacion_productos

-- COLUMNAS PRINCIPALES
id_evaluacion (PK)
id_producto (FK)
fecha_evaluacion
calidad_general (1-5)
relacion_calidad_precio (1-5)
durabilidad_calificada (1-5)
facilidad_mantenimiento (1-5)
soporte_marca (1-5) -- Si tuviste que contactarlos
volveria_comprar (boolean)
recomendaria_otros (boolean)
puntos_fuertes (array) -- ['durable', 'bonito', 'funcional']
puntos_debiles (array) -- ['caro', 'fragil', 'mal_servicio']
mejores_usos (array) -- ['cocina', 'oficina', 'exterior']
peores_usos (array)
comparativa_marcas (texto) -- "Mejor que X, peor que Y"
costo_mantenimiento_mensual
frecuencia_mantenimiento
notas_evaluacion
fecha_proxima_evaluacion

# reabastecimiento

-- COLUMNAS PRINCIPALES
id_reabastecimiento (PK)
id_producto (FK)
stock_actual
stock_minimo (punto de reorden)
stock_maximo
tasa_consumo_promedio (unidades/día)
dias_autonomia_actual (calculado)
proxima_compra_estimada
urgencia_reabastecimiento ['baja', 'media', 'alta', 'critica']
mejor_establecimiento_historico
mejor_precio_historico
precio_promedio_mercado
marcas_alternativas_recomendadas (array)
establecimientos_alternativos (array)
temporadas_mejor_precio (array) -- ['verano', 'black_friday']
frecuencia_compra_optima ['semanal', 'quincenal', 'mensual', 'trimestral']
cantidad_compra_optima
notas_reabastecimiento

# metrica_productos

-- COLUMNAS PRINCIPALES
id_metrica (PK)
id_producto (FK)
fecha_calculo
costo_por_uso (calculado: precio_total / usos_totales)
costo_por_dia (calculado: precio_total / dias_vida_util)
valor_residual_actual (si se puede vender)
tasa_utilizacion (porcentaje del tiempo usado vs disponible)
eficiencia_energetica (si aplica, kWh por uso)
costo_mantenimiento_acumulado
horas_vida_util (si aplica)
ciclos_vida_util (si aplica, ej: lavadoras)
rendimiento_por_unidad (ej: km/litro, páginas/tóner)
impacto_ambiental_estimado (kg CO2)
costo_oportunidad (vs alternativas)
ROI_producto (si genera ingresos o ahorros)

# historial_precios

-- COLUMNAS PRINCIPALES
id_precio (PK)
id_producto (FK)
fecha_registro
establecimiento
precio_unitario
precio_promocion
disponibilidad_stock
condiciones_promocion (texto)
es_mejor_precio_historico (boolean)
fuente_precio ['compra_real', 'investigacion_online', 'publicidad']
notas_precio
tendencia_precio ['bajando', 'estable', 'subiendo', 'volatil']
precio_competencia (si conocido)
diferencia_porcentual_competencia

# entradas

-- COLUMNAS MEJORADAS
id_entrada (PK)
fecha_entrada
fecha_registro
fuente_ingreso -- ['sueldo', 'freelance', 'inversiones', 'regalo', 'reembolso', 'venta', 'otros']
subfuente_ingreso -- "Empresa X", "Cliente Y", "Dividendos Z"
monto_bruto
impuestos_retenidos
monto_neto
moneda
frecuencia_esperada -- ['unico', 'semanal', 'quincenal', 'mensual', 'trimestral', 'anual']
estado_entrada -- ['confirmado', 'pendiente', 'cancelado']
categoria_ingreso -- ['laboral', 'pasivo', 'ocasional', 'extraordinario']
metodo_recepcion -- ['transferencia', 'efectivo', 'cheque', 'plataforma']
cuenta_destino -- Banco/cuenta donde cayó
comentarios
etiquetas -- ['trabajo_extra', 'ingreso_pasivo', 'inesperado']
persona_relacionada -- Quien pagó (si aplica)
es_recurrente_automatico (boolean)
fecha_proximo_ingreso_esperado -- Para ingresos recurrentes

# control_mensual

-- COLUMNAS MEJORADAS
id_control (PK)
año
mes
mes_numero
estado_mes -- ['en_progreso', 'cerrado', 'ajustando']

-- INGRESOS
residuo_mes_anterior -- Dinero que llegó del mes anterior
total_sueldos -- Suma de ingresos laborales
total_entradas_no_laborales -- Suma de otros ingresos
total_ingresos -- Calculado: sueldos + entradas_no_laborales

-- GASTOS
total_gastos_esenciales -- Suma de gastos tipo "esencial"
total_gastos_confort -- Suma de gastos tipo "confort" 
total_gastos_lujo -- Suma de gastos tipo "lujo"
total_gastos_inversion -- Suma de gastos tipo "inversion"
total_gastos -- Calculado: suma de todos los gastos

-- MÉTRICAS CLAVE
ahorro_bruto_mes -- total_ingresos - total_gastos
ahorro_neto_mes -- Incluye inversiones y ajustes
tasa_ahorro -- (ahorro_bruto / total_ingresos) * 100
cuenta_final_mes -- Dinero disponible al final
diferencia_presupuesto -- vs presupuesto planeado

-- ANÁLISIS DE COMPORTAMIENTO
gasto_mas_grande_mes -- Monto y descripción
categoria_mas_gastada -- Y monto
mejor_decision_financiera -- Comentario
peor_decision_financiera -- Comentario
leccion_aprendida_mes -- Texto libre

-- CONTROL
mes_cerrado -- ['V', ''] (tu columna original)
fecha_cierre -- Cuando se cerró el mes
usuario_cierre -- Quién cerró el mes
comentarios_cierre
residuo_proximo_mes -- Calculado: cuenta_final_mes

# presupuestos_mensuales

-- COLUMNAS
id_presupuesto (PK)
año
mes
categoria
subcategoria
monto_presupuestado
monto_real (calculado de gastos)
diferencia
porcentaje_ejecucion
prioridad_categoria -- [1-5]
notas_presupuesto
flexibilidad_presupuesto -- ['rigido', 'flexible', 'variable']
ajustes_realizados (array) -- Historial de cambios

# objetivos_financieros

-- COLUMNAS
id_objetivo (PK)
nombre_objetivo
tipo_objetivo -- ['ahorro', 'inversion', 'deuda', 'compra']
monto_objetivo
fecha_limite
monto_actual
progreso_porcentaje
prioridad -- [1-5]
estado -- ['activo', 'completado', 'cancelado', 'en_riesgo']
categoria_asociada -- Del presupuesto
cuenta_destino -- Donde se acumula
contribucion_mensual_sugerida
contribucion_mensual_real
fecha_creacion
ultima_actualizacion
comentarios
alertas_activadas -- ['atraso', 'riesgo', 'completado']

