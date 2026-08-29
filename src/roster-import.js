const HEADER_ALIASES = {
  number: ["号码", "球衣号码", "队员号码", "number", "no", "no."],
  name: ["姓名", "队员姓名", "球员姓名", "player", "name"],
  libero: ["自由人", "自由防守队员", "libero", "l"],
  captain: ["队长", "是否队长", "captain", "c"],
  captainNumber: ["队长号码", "captainnumber", "captainno"],
  teamName: ["队伍名称", "球队名称", "队名", "team", "teamname"],
  coach: ["主教练", "教练", "coach"]
};

function cleanHeader(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_\-（）()]/g, "");
}

function headerIndex(headers, aliases) {
  const normalized = headers.map(cleanHeader);
  return normalized.findIndex(header => aliases.some(alias => cleanHeader(alias) === header));
}

function truthyMarker(value, kind) {
  const marker = cleanHeader(value);
  if (!marker) return false;
  const common = ["1", "true", "yes", "y", "是", "√", "✓"];
  const specific = kind === "libero" ? ["l", "libero", "自由人", "自由防守队员"] : ["c", "captain", "队长"];
  return [...common, ...specific].includes(marker);
}

export function parseDelimitedText(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const candidates = [",", "\t", ";"];
  const firstRecord = source.split(/\r?\n/).find(line => line.trim()) || "";
  const delimiter = candidates.map(value => ({ value, count: firstRecord.split(value).length })).sort((a, b) => b.count - a.count)[0].value;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function findEndOfCentralDirectory(bytes) {
  const start = Math.max(0, bytes.length - 65557);
  for (let index = bytes.length - 22; index >= start; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  return -1;
}

async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error("无法识别该 XLSX 文件的压缩结构。");
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map();
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XLSX 文件目录结构不完整。");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)).replaceAll("\\", "/");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    let content;
    if (method === 0) {
      content = compressed;
    } else if (method === 8 && typeof DecompressionStream === "function") {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      content = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      throw new Error("当前浏览器无法解压该 XLSX 文件，请另存为 CSV 后重试。");
    }
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function columnIndex(reference) {
  const letters = String(reference || "A").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function xmlText(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

export async function parseXlsxBuffer(buffer) {
  if (typeof DOMParser !== "function") throw new Error("当前环境不支持读取 XLSX，请使用浏览器打开页面。");
  const entries = await unzipEntries(buffer);
  let sheetName = "";
  const workbookBytes = entries.get("xl/workbook.xml");
  const relationBytes = entries.get("xl/_rels/workbook.xml.rels");
  if (workbookBytes && relationBytes) {
    const workbook = parser.parseFromString(xmlText(workbookBytes), "application/xml");
    const relations = parser.parseFromString(xmlText(relationBytes), "application/xml");
    const firstSheet = workbook.getElementsByTagName("sheet")[0];
    const relationId = firstSheet?.getAttribute("r:id") || firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const relation = [...relations.getElementsByTagName("Relationship")].find(item => item.getAttribute("Id") === relationId);
    const target = relation?.getAttribute("Target") || "";
    sheetName = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  if (!entries.has(sheetName)) sheetName = [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort()[0];
  if (!sheetName) throw new Error("XLSX 中没有可读取的工作表。");
  const parser = new DOMParser();
  const sharedBytes = entries.get("xl/sharedStrings.xml");
  const shared = sharedBytes
    ? [...parser.parseFromString(xmlText(sharedBytes), "application/xml").getElementsByTagName("si")].map(item => [...item.getElementsByTagName("t")].map(node => node.textContent || "").join(""))
    : [];
  const document = parser.parseFromString(xmlText(entries.get(sheetName)), "application/xml");
  if (document.querySelector("parsererror")) throw new Error("XLSX 工作表内容无法解析。");
  return [...document.getElementsByTagName("row")].map(rowNode => {
    const row = [];
    [...rowNode.getElementsByTagName("c")].forEach(cell => {
      const index = columnIndex(cell.getAttribute("r"));
      const type = cell.getAttribute("t");
      const raw = cell.getElementsByTagName("v")[0]?.textContent || "";
      let value = raw;
      if (type === "s") value = shared[Number(raw)] ?? "";
      if (type === "inlineStr") value = [...cell.getElementsByTagName("t")].map(node => node.textContent || "").join("");
      if (type === "b") value = raw === "1" ? "是" : "否";
      row[index] = value;
    });
    return row;
  }).filter(row => row.some(value => String(value ?? "").trim()));
}

export async function parseRosterFile(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".tsv") || file?.type?.includes("csv")) return parseDelimitedText(await file.text());
  if (name.endsWith(".xlsx")) return parseXlsxBuffer(await file.arrayBuffer());
  throw new Error("请选择 .xlsx 或 .csv 文件；旧版 .xls 请先在 Excel 中另存为 .xlsx。");
}

export function normalizeRosterRows(rows) {
  const cleanRows = (rows || []).map(row => Array.from(row || [], value => String(value ?? "").trim())).filter(row => row.some(Boolean));
  const headerRowIndex = cleanRows.slice(0, 10).findIndex(row => headerIndex(row, HEADER_ALIASES.number) >= 0 && headerIndex(row, HEADER_ALIASES.name) >= 0);
  if (headerRowIndex < 0) throw new Error("未找到表头。至少需要“号码”和“姓名”两列。");
  const headers = cleanRows[headerRowIndex];
  const columns = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, headerIndex(headers, aliases)]));
  const valueAt = (row, key) => columns[key] >= 0 ? String(row[columns[key]] ?? "").trim() : "";
  const players = [];
  let teamName = "";
  let coach = "";
  let captain = "";
  const captainMarkers = [];
  cleanRows.slice(headerRowIndex + 1).forEach((row, index) => {
    const number = valueAt(row, "number").replace(/\.0$/, "");
    const name = valueAt(row, "name");
    if (!number && !name) return;
    if (!number || !name) throw new Error(`第 ${headerRowIndex + index + 2} 行的号码或姓名为空。`);
    players.push({ number, name, libero: truthyMarker(valueAt(row, "libero"), "libero") });
    if (truthyMarker(valueAt(row, "captain"), "captain")) captainMarkers.push(number);
    teamName ||= valueAt(row, "teamName");
    coach ||= valueAt(row, "coach");
    captain ||= valueAt(row, "captainNumber").replace(/\.0$/, "");
  });
  if (players.length < 6) throw new Error("有效队员少于 6 人，不能组成比赛阵容。");
  if (players.length > 14) throw new Error("当前记录表最多支持 14 名队员，请精简名单后再导入。");
  const numbers = players.map(player => player.number);
  if (new Set(numbers).size !== numbers.length) throw new Error("名单中存在重复号码。");
  if (players.filter(player => player.libero).length > 2) throw new Error("自由人不能超过 2 名。");
  if (captainMarkers.length > 1) throw new Error("名单中标记了多名队长，请只保留一名。");
  if (captainMarkers.length === 1) captain = captainMarkers[0];
  if (captain && !numbers.includes(captain)) throw new Error("队长号码不在导入的队员名单中。");
  const warnings = [];
  if (!captain) warnings.push("文件中未指定队长，导入后请填写队长号码。");
  if (!teamName) warnings.push("文件中未填写队伍名称，将保留页面现有名称。");
  return { players, teamName, coach, captain, warnings, headerRowIndex };
}
