const XLSX = require('xlsx');

console.log('\n📊 Verificando archivo Excel...\n');

const wb = XLSX.readFile('data/Reporte Diario OaaS Celsia 20251126.xlsx');
const ws = wb.Sheets['Analisis casos'];
const data = XLSX.utils.sheet_to_json(ws);

console.log('Total de filas:', data.length);

// Encontrar columna de fecha
const fechaCol = Object.keys(data[0]).find(k => /fecha|date|create/i.test(k));
console.log('\nColumna de fecha:', fechaCol);

if (fechaCol) {
  // Convertir todas las fechas
  const fechas = data.map(r => r[fechaCol]).filter(f => f);
  const fechasStr = fechas.map(f => {
    if (typeof f === 'number') {
      // Excel serial date
      const date = new Date((f - 25569) * 86400 * 1000);
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${day}/${month}/${year}`;
    }
    return String(f);
  });

  console.log('\n📅 Rango de fechas:');
  console.log('Primera fecha:', fechasStr[0]);
  console.log('Última fecha:', fechasStr[fechasStr.length - 1]);

  // Buscar octubre 2025
  const octubre2025 = fechasStr.filter(f => f.includes('/10/2025'));
  console.log('\n🔍 Búsqueda de octubre 2025:');
  console.log('Casos encontrados:', octubre2025.length);
  
  if (octubre2025.length > 0) {
    console.log('Primeros 5 ejemplos:', octubre2025.slice(0, 5));
  } else {
    console.log('❌ No se encontraron datos de octubre 2025');
    
    // Mostrar últimas 10 fechas
    console.log('\n📆 Últimas 10 fechas en el archivo:');
    fechasStr.slice(-10).forEach((f, i) => {
      console.log(`  ${i + 1}. ${f}`);
    });
  }
}
