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
```
