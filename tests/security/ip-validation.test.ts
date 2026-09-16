import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidIp, isPrivateOrReservedIp, isPublicIp } from '../../src/server/lib/ip.ts';

describe('IP Security & SSRF Defense Test Suite', () => {
  describe('IPv4 Validation & Parsing', () => {
    it('accepts valid standard public IPv4 addresses', () => {
      assert.equal(isValidIp('8.8.8.8'), true);
      assert.equal(isValidIp('1.1.1.1'), true);
      assert.equal(isValidIp('114.114.114.114'), true);
      assert.equal(isValidIp('208.67.222.222'), true);
    });

    it('rejects malformed IPv4 strings and injection attempts', () => {
      assert.equal(isValidIp(''), false);
      assert.equal(isValidIp('   '), false);
      assert.equal(isValidIp('localhost'), false);
      assert.equal(isValidIp('google.com'), false);
      assert.equal(isValidIp('8.8.8.8.8'), false);
      assert.equal(isValidIp('256.1.1.1'), false);
      assert.equal(isValidIp('1.1.1.-1'), false);
      assert.equal(isValidIp('8.8.8.8/admin'), false);
      assert.equal(isValidIp('8.8.8.8@attacker.com'), false);
      assert.equal(isValidIp('127.0.0.1%00'), false);
      assert.equal(isValidIp('127.0.0.1; rm -rf /'), false);
    });

    it('rejects leading zero octets (octal ambiguity / parser differential attacks)', () => {
      assert.equal(isValidIp('010.0.0.1'), false);
      assert.equal(isValidIp('127.000.000.001'), false);
      assert.equal(isValidIp('0127.0.0.1'), false);
      assert.equal(isValidIp('192.168.01.1'), false);
    });
  });

  describe('IPv6 Validation & Parsing', () => {
    it('accepts valid public IPv6 addresses', () => {
      assert.equal(isValidIp('2001:4860:4860::8888'), true);
      assert.equal(isValidIp('2606:4700:4700::1111'), true);
      assert.equal(isValidIp('2400:cb00:2048:1::c629:d7a2'), true);
    });

    it('rejects malformed IPv6 strings', () => {
      assert.equal(isValidIp('2001:::1'), false);
      assert.equal(isValidIp('gggg::1'), false);
      assert.equal(isValidIp('12345::1'), false);
      assert.equal(isValidIp(':::'), false);
    });
  });

  describe('SSRF & Private/Reserved IP Defense', () => {
    it('identifies RFC 1918 private IPv4 ranges as private', () => {
      // 10.0.0.0/8
      assert.equal(isPrivateOrReservedIp('10.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('10.255.255.255'), true);
      // 172.16.0.0/12
      assert.equal(isPrivateOrReservedIp('172.16.0.1'), true);
      assert.equal(isPrivateOrReservedIp('172.24.10.5'), true);
      assert.equal(isPrivateOrReservedIp('172.31.255.255'), true);
      // 192.168.0.0/16
      assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
      assert.equal(isPrivateOrReservedIp('192.168.254.254'), true);
    });

    it('identifies loopback and local addresses as private', () => {
      assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('127.127.127.127'), true);
      assert.equal(isPrivateOrReservedIp('0.0.0.0'), true);
    });

    it('blocks Cloud Metadata Service (169.254.169.254) and link-local ranges', () => {
      assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
      assert.equal(isPrivateOrReservedIp('169.254.1.1'), true);
    });

    it('blocks Carrier-Grade NAT (CGNAT) 100.64.0.0/10', () => {
      assert.equal(isPrivateOrReservedIp('100.64.0.1'), true);
      assert.equal(isPrivateOrReservedIp('100.100.50.1'), true);
      assert.equal(isPrivateOrReservedIp('100.127.255.255'), true);
      // 100.128.0.1 is outside CGNAT range
      assert.equal(isPrivateOrReservedIp('100.128.0.1'), false);
    });

    it('blocks Multicast (224-239) and Future Use (240-255) ranges', () => {
      assert.equal(isPrivateOrReservedIp('224.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('239.255.255.250'), true);
      assert.equal(isPrivateOrReservedIp('240.0.0.1'), true);
      assert.equal(isPrivateOrReservedIp('255.255.255.255'), true);
    });

    it('identifies private, unique-local, and loopback IPv6 as private', () => {
      assert.equal(isPrivateOrReservedIp('::1'), true);
      assert.equal(isPrivateOrReservedIp('::'), true);
      assert.equal(isPrivateOrReservedIp('fe80::1'), true); // Link-local
      assert.equal(isPrivateOrReservedIp('fc00::1'), true); // Unique-local
      assert.equal(isPrivateOrReservedIp('fd00::1'), true); // Unique-local
      assert.equal(isPrivateOrReservedIp('ff02::1'), true); // Multicast
      assert.equal(isPrivateOrReservedIp('2001:db8::1'), true); // Documentation
    });

    it('isPublicIp returns true ONLY for genuine public internet addresses', () => {
      assert.equal(isPublicIp('8.8.8.8'), true);
      assert.equal(isPublicIp('1.1.1.1'), true);
      assert.equal(isPublicIp('2001:4860:4860::8888'), true);

      assert.equal(isPublicIp('127.0.0.1'), false);
      assert.equal(isPublicIp('169.254.169.254'), false);
      assert.equal(isPublicIp('10.0.0.1'), false);
      assert.equal(isPublicIp('192.168.1.1'), false);
      assert.equal(isPublicIp('::1'), false);
      assert.equal(isPublicIp('invalid_ip'), false);
    });
  });
});
