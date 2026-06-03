const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Header,
  Footer,
  ImageRun,
  BorderStyle,
  VerticalAlign,
  PageNumber,
  NumberFormat,
  TableOfContents,
  StyleLevel,
} = require('docx');
const fs = require('node:fs');
const path = require('node:path');

async function generarPlantillaEvidencia() {
  const logoPath = path.join(process.cwd(), 'assets', 'sunedu-logo.png');
  let logoImage;
  if (fs.existsSync(logoPath)) {
    logoImage = new ImageRun({
      data: fs.readFileSync(logoPath),
      transformation: { width: 120, height: 45 },
    });
  }

  const doc = new Document({
    title: 'Informe de Evidencia de Pruebas de Rendimiento - REGINSA',
    features: {
      updateFields: true,
    },
    styles: {
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Arial', size: 28, bold: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: 'Arial', size: 26, bold: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      ],
    },
    sections: [
      // --- SECCIÓN 1: PORTADA ---
      {
        properties: {},
        children: [
          new Paragraph({ text: '', spacing: { before: 1000 } }),
          logoImage
            ? new Paragraph({ children: [logoImage], alignment: AlignmentType.CENTER })
            : new Paragraph({ text: '[LOGO SUNEDU]' }),
          new Paragraph({ text: '', spacing: { before: 1500 } }),
          new Paragraph({
            text: 'Informe de Pruebas Integrales de Rendimiento',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: 'MÓDULO DE INFRACCIONES Y SANCIONES (REGINSA)',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: 'Versión v1.0.0',
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '', spacing: { before: 2000 } }),
          new Paragraph({
            children: [
              new TextRun({ text: 'SUNEDU', bold: true }),
              new TextRun({ text: '\nVersión: 1.0', break: 1 }),
              new TextRun({ text: '\n\nActualizado a', break: 2 }),
              new TextRun({ text: `\nMayo del 2026`, break: 1 }),
            ],
            alignment: AlignmentType.RIGHT,
          }),
        ],
      },
      // --- SECCIÓN 2: HISTORIAL Y TABLA DE CONTENIDO ---
      {
        properties: { type: 'nextPage' },
        headers: {
          default: new Header({
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [logoImage ? new Paragraph({ children: [logoImage] }) : new Paragraph('SUNEDU')],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            text: 'INFORME DE PRUEBAS INTEGRALES\nREGINSA – v1.0.0 - Sanciones',
                            alignment: AlignmentType.CENTER,
                            bold: true,
                          }),
                        ],
                        width: { size: 50, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({ text: 'Versión: 1.0\nCódigo: PS.4.2-F-16', size: 16 })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            text: 'Historial de las revisiones',
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ['Ítem', 'Versión', 'Fecha', 'Autor', 'Descripción', 'Estado', 'Firma'].map(
                  (h) => new TableCell({ children: [new Paragraph({ text: h, bold: true })] }),
                ),
              }),
              new TableRow({
                children: ['1.', '1.0', '28.05.2026', 'Ingeniería QA', 'VERSIÓN INICIAL - REGINSA', 'E', ''].map(
                  (v) => new TableCell({ children: [new Paragraph(v)] }),
                ),
              }),
              new TableRow({
                children: ['2.', '', '', '', '', '', ''].map((v) => new TableCell({ children: [new Paragraph(v)] })),
              }),
            ],
          }),
          new Paragraph({ text: '', spacing: { before: 500 } }),
          new Paragraph({ text: 'Tabla de contenido', heading: HeadingLevel.HEADING_1 }),
          new TableOfContents('Tabla de contenido', {
            hyperlink: true,
            headingStyleRange: '1-5',
            stylesWithLevels: [
              new StyleLevel('Heading1', 1),
              new StyleLevel('Heading2', 2),
              new StyleLevel('Heading3', 3),
              new StyleLevel('Heading4', 4),
              new StyleLevel('Heading5', 5),
            ],
          }),
        ],
      },
      // --- SECCIÓN 3: INTRODUCCIÓN Y DATOS ---
      {
        properties: { type: 'nextPage' },
        children: [
          new Paragraph({ text: '1. Introducción', heading: HeadingLevel.HEADING_1 }),
          new Paragraph(
            'El presente documento contiene el informe de pruebas integrales de rendimiento realizadas al proyecto REGINSA - Módulo de Registro de Infracciones y Sanciones.',
          ),
          new Paragraph({ text: '1.1. Objetivo', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Informar los resultados de rendimiento y estrés en la versión de REGINSA v1.0.0.'),
          new Paragraph({ text: '1.5. Datos del Informe', heading: HeadingLevel.HEADING_2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Sistema')] }),
                  new TableCell({ children: [new Paragraph('Sistema REGINSA')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Gestor Responsable')] }),
                  new TableCell({ children: [new Paragraph('Ingeniería QA')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Solicitante')] }),
                  new TableCell({ children: [new Paragraph('OTI')] }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: '2. Evaluaciones Efectuadas', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: '2.1. Pruebas de Caja Negra', heading: HeadingLevel.HEADING_2 }),
        ],
      },
    ],
  });

  // --- SECCIÓN 4: EVIDENCIA DE CASOS ---
  const casos = [
    { id: 'CP-REG-01', desc: 'Auditoría Forense - Agregar Administrado (Caso 01)' },
    { id: 'CP-REG-02', desc: 'Carga Base Orgánica - Registrar Sanción (Caso 02)' },
    { id: 'CP-REG-07', desc: 'Pico Repentino - Reconsideración con Sanción (Caso 04)' },
  ];

  casos.forEach((c) => {
    doc.addSection({
      children: [
        new Paragraph({ text: `2.2.1. Evidencia: ${c.id}`, heading: HeadingLevel.HEADING_2 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ text: `N° ${c.id.split('-').pop()}`, bold: true })],
                  width: { size: 20, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [new Paragraph({ text: 'Descripción', bold: true })],
                  width: { size: 80, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(c.id)] }),
                new TableCell({ children: [new Paragraph(c.desc)] }),
              ],
            }),
          ],
        }),
        new Paragraph({ text: 'Evidencia de cambio realizado según requerimiento:', spacing: { before: 200 } }),
        new Paragraph({ text: 'PRUEBAS QA REGINSA', bold: true }),
        new Paragraph({ text: '', spacing: { before: 100 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              height: { value: 4000, rule: 'atLeast' },
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      text: '\n\n\n[PEGAR AQUÍ CAPTURA DE PANTALLA DE K6 / TERMINAL]\n\n\n',
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                  verticalAlign: VerticalAlign.CENTER,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });

  // --- SECCIÓN CONCLUSIONES ---
  doc.addSection({
    children: [
      new Paragraph({ text: '3. Conclusiones', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: '[ESPACIO PARA CONCLUSIONES]', alignment: AlignmentType.CENTER }),
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = 'PLANTILLA_EVIDENCIA_PROFESIONAL_REGINSA.docx';
  fs.writeFileSync(path.join(process.cwd(), fileName), buffer);
  console.log(`✅ Plantilla profesional generada: ${fileName}`);
}

generarPlantillaEvidencia().catch((err) => console.error(err));
