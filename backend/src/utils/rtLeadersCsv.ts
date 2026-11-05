/** Pure CSV parsing/validation for the Ketua RT operational import. */

export const RT_LEADERS_CSV_HEADER = [
  'rtNumber',
  'name',
  'phone',
  'phoneIsWhatsapp',
  'alamat',
  'latitude',
  'longitude',
] as const;

export interface RtLeaderImportRow {
  rowNumber: number;
  rtNumber: number;
  name?: string;
  phone?: string;
  phoneIsWhatsapp?: boolean;
  alamat?: string | null;
  latitude?: number;
  longitude?: number;
}

export interface RtLeaderImportError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface ParsedRtLeadersCsv {
  rows: RtLeaderImportRow[];
  errors: RtLeaderImportError[];
}

/**
 * Parses raw CSV text into rows and columns while respecting quoted fields
 * that span multiple lines and escaped quotes ("").
 */
function parseCsvRecords(input: string): {
  records: string[][];
  errors: RtLeaderImportError[];
} {
  const cleanInput = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  const errors: RtLeaderImportError[] = [];

  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let logicalRowNumber = 1;

  for (let i = 0; i < cleanInput.length; i += 1) {
    const char = cleanInput[i];

    if (inQuotes) {
      if (char === '"') {
        if (cleanInput[i + 1] === '"') {
          currentField += '"';
          i += 1; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && cleanInput[i + 1] === '\n') {
        i += 1; // consume CRLF
      }
      currentRow.push(currentField);
      currentField = '';

      // Skip empty line at very end or start
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0]!.trim() !== '')) {
        records.push(currentRow);
        logicalRowNumber += 1;
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (inQuotes) {
    errors.push({
      rowNumber: logicalRowNumber,
      field: 'row',
      message: 'Format CSV tidak valid: tanda kutip penutup tidak ditemukan.',
    });
  }

  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0]!.trim() !== '')) {
      records.push(currentRow);
    }
  }

  return { records, errors };
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'ya', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'tidak', 'no'].includes(normalized)) return false;
  return undefined;
}

const CLEAR_TOKEN = '\\N';

export function parseRtLeadersCsv(input: string): ParsedRtLeadersCsv {
  const { records, errors } = parseCsvRecords(input);
  if (errors.length > 0) {
    return { rows: [], errors };
  }

  if (records.length === 0) {
    return {
      rows: [],
      errors: [{ rowNumber: 1, field: 'header', message: 'CSV kosong.' }],
    };
  }

  const headerRow = records.shift() ?? [];
  const header = headerRow.map((item) => item.trim());

  if (header.join(',') !== RT_LEADERS_CSV_HEADER.join(',')) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          field: 'header',
          message: `Header CSV harus: ${RT_LEADERS_CSV_HEADER.join(',')}`,
        },
      ],
    };
  }

  const rows: RtLeaderImportRow[] = [];
  const seen = new Set<number>();

  records.forEach((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== RT_LEADERS_CSV_HEADER.length) {
      errors.push({
        rowNumber,
        field: 'row',
        message: `Jumlah kolom harus ${RT_LEADERS_CSV_HEADER.length}.`,
      });
      return;
    }

    const [
      rawRt = '',
      rawName = '',
      rawPhone = '',
      rawWhatsapp = '',
      rawAlamat = '',
      rawLat = '',
      rawLon = '',
    ] = values.map((v) => v.trim());

    const rtNumber = Number(rawRt);
    if (!/^\d+$/.test(rawRt) || !Number.isInteger(rtNumber) || rtNumber < 1 || rtNumber > 100) {
      errors.push({ rowNumber, field: 'rtNumber', message: 'Nomor RT harus 1–100.' });
      return;
    }
    if (seen.has(rtNumber)) {
      errors.push({ rowNumber, field: 'rtNumber', message: `RT ${rtNumber} duplikat.` });
      return;
    }
    seen.add(rtNumber);

    if (rawName.length > 191) {
      errors.push({ rowNumber, field: 'name', message: 'Nama maksimal 191 karakter.' });
    }
    if (rawPhone.length > 191) {
      errors.push({ rowNumber, field: 'phone', message: 'Telepon maksimal 191 karakter.' });
    }
    if (rawAlamat.length > 2000) {
      errors.push({ rowNumber, field: 'alamat', message: 'Alamat maksimal 2000 karakter.' });
    }

    // Support explicit clear token \N
    const isPhoneCleared = rawPhone.toUpperCase() === CLEAR_TOKEN;
    const isAlamatCleared = rawAlamat.toUpperCase() === CLEAR_TOKEN;

    const parsedPhone = isPhoneCleared ? '' : rawPhone ? rawPhone : undefined;
    const parsedAlamat = isAlamatCleared ? null : rawAlamat ? rawAlamat : undefined;

    let whatsapp = parseBoolean(rawWhatsapp);
    if (rawWhatsapp && whatsapp === undefined && rawWhatsapp.toUpperCase() !== CLEAR_TOKEN) {
      errors.push({ rowNumber, field: 'phoneIsWhatsapp', message: 'Nilai harus true/false.' });
    }
    if (isPhoneCleared || parsedPhone === '') {
      whatsapp = false;
    }

    const hasLat = rawLat !== '';
    const hasLon = rawLon !== '';
    let latitude: number | undefined;
    let longitude: number | undefined;
    if (hasLat !== hasLon) {
      errors.push({
        rowNumber,
        field: 'coordinates',
        message: 'Latitude dan longitude harus diisi bersama.',
      });
    } else if (hasLat) {
      latitude = Number(rawLat);
      longitude = Number(rawLon);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        errors.push({ rowNumber, field: 'latitude', message: 'Latitude harus -90–90.' });
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        errors.push({ rowNumber, field: 'longitude', message: 'Longitude harus -180–180.' });
      }
    }

    rows.push({
      rowNumber,
      rtNumber,
      ...(rawName ? { name: rawName } : {}),
      ...(parsedPhone !== undefined ? { phone: parsedPhone } : {}),
      ...(whatsapp !== undefined ? { phoneIsWhatsapp: whatsapp } : {}),
      ...(parsedAlamat !== undefined ? { alamat: parsedAlamat } : {}),
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: 2, field: 'row', message: 'CSV tidak berisi baris data.' });
  }

  return { rows, errors };
}
