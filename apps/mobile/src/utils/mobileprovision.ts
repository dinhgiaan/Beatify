import { toByteArray } from 'base64-js';

/**
 * Tìm vị trí bắt đầu của một mảng byte con trong mảng byte lớn
 */
export function findSequence(data: Uint8Array, sequence: number[]): number {
  if (sequence.length === 0 || data.length < sequence.length) return -1;
  for (let i = 0; i <= data.length - sequence.length; i++) {
    let match = true;
    for (let j = 0; j < sequence.length; j++) {
      if (data[i + j] !== sequence[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Bóc tách ngày hết hạn ExpirationDate từ dữ liệu Base64 của file embedded.mobileprovision
 * embedded.mobileprovision = [CMS Header] + [XML Plist thuần ASCII] + [CMS Signature]
 *
 * Để tránh lỗi corrupt UTF-8 trên dữ liệu nhị phân CMS và lỗi ReferenceError: TextDecoder trên Hermes:
 * 1. Chuyển Base64 sang Uint8Array bằng base64-js
 * 2. Tìm byte marker <?xml và </plist>
 * 3. Chỉ giải mã đoạn byte ASCII nằm giữa bằng String.fromCharCode theo từng chunk 8192 byte
 * 4. Parse trường ExpirationDate bằng Date
 */
export function parseMobileprovisionExpiration(base64String: string): Date | null {
  try {
    const bytes = toByteArray(base64String);

    // Marker ASCII: <?xml và </plist>
    const startSeq = [0x3c, 0x3f, 0x78, 0x6d, 0x6c]; // <?xml
    const endSeq = [0x3c, 0x2f, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x3e]; // </plist>

    const startIdx = findSequence(bytes, startSeq);
    const endIdx = findSequence(bytes, endSeq);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

    // Trích xuất đoạn byte XML thuần ASCII
    const xmlBytes = bytes.subarray(startIdx, endIdx + endSeq.length);

    // Giải mã an toàn trên Hermes bằng String.fromCharCode theo từng chunk để tránh stack overflow
    let xmlString = '';
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < xmlBytes.length; i += CHUNK_SIZE) {
      const chunk = xmlBytes.subarray(i, i + CHUNK_SIZE);
      xmlString += String.fromCharCode.apply(null, Array.from(chunk));
    }

    // Trích xuất ExpirationDate: <key>ExpirationDate</key>\s*<date>ISO_DATE</date>
    const match = xmlString.match(/<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/);
    if (!match || !match[1]) return null;

    const date = new Date(match[1]);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
