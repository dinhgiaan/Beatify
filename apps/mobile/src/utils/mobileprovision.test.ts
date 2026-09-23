import { describe, expect, it } from 'vitest';
import { fromByteArray } from 'base64-js';
import { findSequence, parseMobileprovisionExpiration } from './mobileprovision.js';

describe('mobileprovision parser', () => {
  it('findSequence returns correct index for matching byte sequence', () => {
    const data = new Uint8Array([0x00, 0x10, 0x3c, 0x3f, 0x78, 0x6d, 0x6c, 0xff]);
    const sequence = [0x3c, 0x3f, 0x78, 0x6d, 0x6c];
    expect(findSequence(data, sequence)).toBe(2);
  });

  it('findSequence returns -1 when sequence is not found', () => {
    const data = new Uint8Array([0x00, 0x10, 0x20]);
    const sequence = [0x3c, 0x3f];
    expect(findSequence(data, sequence)).toBe(-1);
  });

  it('correctly extracts ExpirationDate from mock CMS enveloped mobileprovision', () => {
    // Giả lập CMS binary header chứa các byte không hợp lệ trong UTF-8
    const cmsHeader = [0x30, 0x82, 0x1f, 0xff, 0xfe, 0x80, 0x81, 0x00];

    const xmlPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>AppIDName</key>
\t<string>Beatify</string>
\t<key>ExpirationDate</key>
\t<date>2026-10-01T12:30:00Z</date>
\t<key>Name</key>
\t<string>iOS Team Provisioning Profile: com.dinhgiaan.beatify</string>
</dict>
</plist>`;
    const xmlBytes = Array.from(xmlPlist).map((c) => c.charCodeAt(0));

    // Giả lập CMS binary signature footer
    const cmsFooter = [0xff, 0xfa, 0x82, 0x12, 0xaa, 0xbb, 0xcc];

    const combinedBytes = new Uint8Array([...cmsHeader, ...xmlBytes, ...cmsFooter]);
    const base64Data = fromByteArray(combinedBytes);

    const parsedDate = parseMobileprovisionExpiration(base64Data);
    expect(parsedDate).not.toBeNull();
    expect(parsedDate?.toISOString()).toBe('2026-10-01T12:30:00.000Z');
  });

  it('returns null if XML markers are missing', () => {
    const garbageBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    const base64Data = fromByteArray(garbageBytes);
    expect(parseMobileprovisionExpiration(base64Data)).toBeNull();
  });

  it('returns null if ExpirationDate tag is missing', () => {
    const xmlPlist = `<?xml version="1.0"?><plist><dict><key>Name</key><string>Beatify</string></dict></plist>`;
    const xmlBytes = Array.from(xmlPlist).map((c) => c.charCodeAt(0));
    const base64Data = fromByteArray(new Uint8Array(xmlBytes));
    expect(parseMobileprovisionExpiration(base64Data)).toBeNull();
  });
});
