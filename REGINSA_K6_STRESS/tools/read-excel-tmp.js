const ExcelJS = require('exceljs');

async function readExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('D:/SUNEDU/AUTOMATIZACION/REGINSA/REGINSA_K6_STRESS/PLAN_DE_PRUEBAS_K6_REGINSA.xlsx');
  
  const worksheet = workbook.worksheets[0]; // Get the first sheet
  const headers = worksheet.getRow(1).values;
  const row2 = worksheet.getRow(2).values;
  
  console.log('Headers:', headers);
  console.log('Row 2:', row2);
}

readExcel().catch(console.error);
