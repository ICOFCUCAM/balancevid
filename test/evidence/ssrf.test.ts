import { describe, expect, it } from 'vitest';
import { UnsafeUrlError, assertPublicUrl, isPrivateAddress } from '../../src/evidence/ssrf.js';

/**
 * Evidence archiving takes a URL from a user and fetches it from inside the
 * network. Without this guard, "attach evidence" is a request-forgery
 * primitive pointed at cloud metadata and internal services. [D-06]
 */
describe('address classification', () => {
  it('rejects the ranges that mean "inside"', () => {
    for (const address of [
      '127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255',
      '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1',
      '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('accepts ordinary public addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('treats anything it cannot parse as unsafe', () => {
    for (const address of ['', 'not-an-ip', '999.1.1.1', '10.1.2']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });
});

describe('url guard', () => {
  it('refuses anything that is not http(s)', async () => {
    for (const url of ['file:///etc/passwd', 'gopher://x/', 'data:text/html,hi']) {
      await expect(assertPublicUrl(url)).rejects.toThrow(UnsafeUrlError);
    }
  });

  it('refuses names for the machine itself', async () => {
    await expect(assertPublicUrl('http://localhost:3000/admin')).rejects.toThrow(/refusing/);
    await expect(assertPublicUrl('http://metadata.google.internal/')).rejects.toThrow(/refusing/);
  });

  it('refuses a literal private address', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/'))
      .rejects.toThrow(/private address/);
    await expect(assertPublicUrl('http://[::1]:8080/')).rejects.toThrow(/private address/);
  });

  it('refuses nonsense', async () => {
    await expect(assertPublicUrl('not a url')).rejects.toThrow(UnsafeUrlError);
  });
});
