// Un .xlsx de verdad (zip con una hoja), sin depender de Excel.
import { zipSync, strToU8 } from "fflate";
const celda = (v, ref) => (typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`);
export function xlsx(filas) {
  const col = (i) => String.fromCharCode(65 + i);
  const filasXml = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => (v === "" || v === null ? "" : celda(v, `${col(c)}${r + 1}`))).join("")}</row>`).join("");
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>`;
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(`${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`${cab}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(hoja),
  }));
}
