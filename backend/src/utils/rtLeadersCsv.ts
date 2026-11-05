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

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'ya', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'tidak', 'no'].includes(normalized)) return false;
  return undefined;
}

export function parseRtLeadersCsv(input: string): ParsedRtLeadersCsv {
  const errors: RtLeaderImportError[] = [];
  const rows: RtLeaderImportRow[] = [];
  const seen = new Set<number>();
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = (lines.shift() ?? '').split(',').map((item) => item.trim());

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

  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    const rowNumber = index + 2;
    const values = splitCsvLine(line);
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

    const whatsapp = parseBoolean(rawWhatsapp);
    if (rawWhatsapp && whatsapp === undefined) {
      errors.push({ rowNumber, field: 'phoneIsWhatsapp', message: 'Nilai harus true/false.' });
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
      ...(rawPhone ? { phone: rawPhone } : {}),
      ...(whatsapp !== undefined ? { phoneIsWhatsapp: whatsapp } : {}),
      ...(rawAlamat ? { alamat: rawAlamat } : {}),
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: 2, field: 'row', message: 'CSV tidak berisi baris data.' });
  }

  return { rows, errors };
}
