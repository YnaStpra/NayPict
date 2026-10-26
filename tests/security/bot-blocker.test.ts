import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isScraperUserAgent, botBlocker } from '../../src/server/security/bot-blocker.ts';

describe('Scraper & Bot Detection Middleware Test Suite', () => {
  describe('User-Agent Signature Analysis', () => {
    it('blocks Python-based scrapers and HTTP libraries', () => {
      const pythonUas = [
        'python-requests/2.31.0',
        'python-requests/2.28.1',
        'Python-urllib/3.10',
        'Python-urllib/3.9',
        'urllib3/1.26.15',
        'aiohttp/3.8.5',
        'Python/3.11 aiohttp/3.8.5',
        'httpx/0.24.1',
        'python-httpx/0.24.1',
        'Scrapy/2.11.0 (+https://scrapy.org)',
        'PycURL/7.45.2',
        'mechanize/0.4.8',
        'BeautifulSoup/4.12',
      ];

      for (const ua of pythonUas) {
        assert.equal(
          isScraperUserAgent(ua),
          true,
          `Expected Python UA "${ua}" to be blocked`
        );
      }
    });

    it('blocks command-line downloaders and HTTP CLI tools', () => {
      const cliUas = [
        'curl/7.88.1',
        'curl/8.1.2',
        'Wget/1.21.3',
        'wget/1.20',
        'aria2/1.36.0',
        'HTTPie/3.2.1',
        'PostmanRuntime/7.32.3',
      ];

      for (const ua of cliUas) {
        assert.equal(
          isScraperUserAgent(ua),
          true,
          `Expected CLI UA "${ua}" to be blocked`
        );
      }
    });

    it('blocks automation engines, headless frameworks, and generic clients', () => {
      const automatedUas = [
        'Go-http-client/1.1',
        'Go-http-client/2.0',
        'Java/17.0.2',
        'Java/11.0.18',
        'libwww-perl/6.50',
        'GuzzleHttp/7',
        'Apache-HttpClient/4.5.13',
        'node-fetch/3.3.0',
        'undici',
        'axios/1.4.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/114.0.5735.198 Safari/537.36',
        'PhantomJS/2.1.1',
        'Selenium/4.10.0',
      ];

      for (const ua of automatedUas) {
        assert.equal(
          isScraperUserAgent(ua),
          true,
          `Expected automated UA "${ua}" to be blocked`
        );
      }
    });

    it('blocks AI web scrapers and LLM training harvesters', () => {
      const aiUas = [
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
        'ChatGPT-User/1.0',
        'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
        'Claude-Web/1.0',
        'anthropic-ai/1.0',
        'Bytespider; spider-feedback@bytedance.com',
        'CCBot/2.0 (https://commoncrawl.org/faq/)',
        'Mozilla/5.0 (compatible; Google-Extended; +https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)',
        'PerplexityBot/1.0 (+https://perplexity.ai/perplexitybot)',
        'Diffbot/0.1',
        'cohere-ai',
        'Omgilibot/0.6',
        'FacebookBot/1.0',
        'Meta-ExternalAgent/1.0',
        'Amazonbot/0.1',
      ];

      for (const ua of aiUas) {
        assert.equal(
          isScraperUserAgent(ua),
          true,
          `Expected AI scraper UA "${ua}" to be blocked`
        );
      }
    });

    it('blocks automated vulnerability scanners and exploit reconnaissance tools', () => {
      const scannerUas = [
        'nuclei - automated scanner',
        'sqlmap/1.7.2#stable (https://sqlmap.org)',
        'Mozilla/5.0 (compatible; Nikto/2.1.6)',
        'Acunetix Vulnerability Scanner',
        'Nmap Scripting Engine',
        'masscan/1.3.2',
        'WPScan v3.8.22',
        'DirBuster-1.0-RC1',
        'gobuster/3.5',
        'ffuf v2.0.0',
        'CensysInspect/1.1',
        'Shodan-Scanner',
        'zgrab/0.x',
        'OpenVAS-Scanner',
        'Nessus/10.5.0',
        'Qualys-Scanner',
      ];

      for (const ua of scannerUas) {
        assert.equal(
          isScraperUserAgent(ua),
          true,
          `Expected security scanner UA "${ua}" to be blocked`
        );
      }
    });

    it('blocks empty, whitespace, or missing User-Agent headers', () => {
      assert.equal(isScraperUserAgent(''), true);
      assert.equal(isScraperUserAgent('   '), true);
      assert.equal(isScraperUserAgent('-'), true);
      assert.equal(isScraperUserAgent(null), true);
      assert.equal(isScraperUserAgent(undefined), true);
    });

    it('allows legitimate standard web browsers', () => {
      const browserUas = [
        // Desktop Chrome
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Mac Safari
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        // iPhone Safari
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        // Desktop Firefox
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
        // Edge
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        // Android Chrome
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',
      ];

      for (const ua of browserUas) {
        assert.equal(
          isScraperUserAgent(ua),
          false,
          `Expected legitimate browser UA "${ua}" to be allowed`
        );
      }
    });

    it('allows legitimate search engine bots for proper SEO indexing', () => {
      const searchBots = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
        'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)',
        'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
        'Mozilla/5.0 (Device; OS_Version) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/605.1.15 (Applebot/0.1)',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Twitterbot/1.0',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
      ];

      for (const bot of searchBots) {
        assert.equal(
          isScraperUserAgent(bot),
          false,
          `Expected legitimate search bot "${bot}" to be allowed`
        );
      }
    });
  });

  describe('Hono Middleware Execution', () => {
    const originalEnv = process.env.DISABLE_BOT_BLOCKER;

    afterEach(() => {
      process.env.DISABLE_BOT_BLOCKER = originalEnv;
    });

    interface MockResponse {
      type: string;
      status: number;
      data?: { code: number; message: string };
      text?: string;
      headers?: Record<string, string>;
    }

    function createMockContext(path: string, userAgent?: string) {
      const headers: Record<string, string> = {};
      if (userAgent !== undefined) {
        headers['user-agent'] = userAgent;
      }

      return {
        req: {
          path,
          header: (name: string) => headers[name.toLowerCase()] || '',
        },
        json: (data: unknown, status: number, extraHeaders?: Record<string, string>) => ({
          type: 'json',
          status,
          data,
          headers: extraHeaders,
        }),
        text: (text: string, status: number, extraHeaders?: Record<string, string>) => ({
          type: 'text',
          status,
          text,
          headers: extraHeaders,
        }),
      } as unknown as Parameters<typeof botBlocker>[0];
    }

    it('blocks Python request to API endpoint with 403 Forbidden', async () => {
      const c = createMockContext('/api/photo/download', 'python-requests/2.31.0');
      let nextCalled = false;
      const next = async () => { nextCalled = true; };

      const response = (await botBlocker(c, next)) as unknown as MockResponse;

      assert.equal(nextCalled, false);
      assert.ok(response);
      assert.equal(response.status, 403);
      assert.equal(response.type, 'json');
      assert.equal(response.data?.code, 403);
    });

    it('blocks curl request to /media/ with 403 text response', async () => {
      const c = createMockContext('/media/thumbnails/abc.webp', 'curl/8.1.2');
      let nextCalled = false;
      const next = async () => { nextCalled = true; };

      const response = (await botBlocker(c, next)) as unknown as MockResponse;

      assert.equal(nextCalled, false);
      assert.ok(response);
      assert.equal(response.status, 403);
      assert.equal(response.type, 'text');
    });

    it('allows legitimate browser request through to next()', async () => {
      const c = createMockContext(
        '/api/photo/list',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      let nextCalled = false;
      const next = async () => { nextCalled = true; };

      await botBlocker(c, next);

      assert.equal(nextCalled, true);
    });

    it('exempts /health path even if probed by curl', async () => {
      const c = createMockContext('/health', 'curl/7.88.1');
      let nextCalled = false;
      const next = async () => { nextCalled = true; };

      await botBlocker(c, next);

      assert.equal(nextCalled, true);
    });

    it('bypasses blocking when DISABLE_BOT_BLOCKER is set to true', async () => {
      process.env.DISABLE_BOT_BLOCKER = 'true';
      const c = createMockContext('/api/photo/list', 'python-requests/2.31.0');
      let nextCalled = false;
      const next = async () => { nextCalled = true; };

      await botBlocker(c, next);

      assert.equal(nextCalled, true);
    });
  });
});
