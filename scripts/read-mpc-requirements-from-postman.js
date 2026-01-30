#!/usr/bin/env node
/**
 * Reads MPC API requirements from the Postman collection and environment.
 * Run from repo root: node scripts/read-mpc-requirements-from-postman.js
 *
 * Output: Structured summary of APIs, request/response expectations, and test scenarios.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const COLLECTION_PATH = path.join(REPO_ROOT, 'MPC Wallet APIs - Complete Test Suite (All Scenarios).postman_collection.json');
const ENV_PATH = path.join(REPO_ROOT, 'MPC API - Local Development.postman_environment.json');

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function extractTestExpectations(events) {
  if (!events || !Array.isArray(events)) return [];
  const testEvent = events.find(e => e.listen === 'test');
  if (!testEvent || !testEvent.script || !testEvent.script.exec) return [];
  return testEvent.script.exec;
}

function extractPreRequest(events) {
  if (!events || !Array.isArray(events)) return [];
  const pre = events.find(e => e.listen === 'prerequest');
  if (!pre || !pre.script || !pre.script.exec) return [];
  return pre.script.exec;
}

function getUrl(request) {
  if (!request.url) return '';
  if (typeof request.url === 'string') return request.url;
  if (request.url.raw) return request.url.raw;
  if (request.url.host && request.url.path) {
    const host = Array.isArray(request.url.host) ? request.url.host.join('') : request.url.host;
    const pathParts = Array.isArray(request.url.path) ? request.url.path : [request.url.path];
    return host + '/' + pathParts.join('/');
  }
  return '';
}

function getBody(request) {
  if (!request.body || request.body.mode !== 'raw') return null;
  return request.body.raw || null;
}

function getHeaders(request) {
  if (!request.header || !Array.isArray(request.header)) return [];
  return request.header.map(h => ({ key: h.key, value: h.value }));
}

function walkItems(items, folderName = '', out) {
  if (!items || !Array.isArray(items)) return;
  for (const item of items) {
    if (item.request) {
      const method = item.request.method || 'GET';
      const url = getUrl(item.request);
      const body = getBody(item.request);
      const tests = extractTestExpectations(item.event);
      const preRequest = extractPreRequest(item.event);
      out.requests.push({
        name: item.name,
        folder: folderName,
        method,
        url,
        body: body ? body.substring(0, 500) + (body.length > 500 ? '...' : '') : null,
        testLines: tests,
        preRequestLines: preRequest,
        description: item.request.description || ''
      });
    } else if (item.item) {
      walkItems(item.item, item.name, out);
    }
  }
}

function summarizeRequirements(collection, env) {
  const out = { requests: [], env: {} };
  walkItems(collection.item, '', out);

  if (env && env.values) {
    out.env = env.values.reduce((acc, v) => {
      acc[v.key] = v.enabled ? (v.value || '(empty)') : '(disabled)';
      return acc;
    }, {});
  }

  return out;
}

function printReport(data) {
  console.log('='.repeat(80));
  console.log('MPC API REQUIREMENTS (from Postman collection & environment)');
  console.log('='.repeat(80));

  console.log('\n--- Environment variables ---');
  Object.entries(data.env).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- API requests & test expectations ---\n');
  let lastFolder = '';
  data.requests.forEach((r, i) => {
    if (r.folder !== lastFolder) {
      console.log(`\n## ${r.folder}`);
      lastFolder = r.folder;
    }
    console.log(`\n  [${i + 1}] ${r.name}`);
    console.log(`      ${r.method} ${r.url}`);
    if (r.body) console.log(`      Body: ${r.body.replace(/\n/g, ' ').trim()}`);
    const statusTests = r.testLines.filter(l => l.includes('status('));
    const propTests = r.testLines.filter(l => l.includes('property(') || l.includes('eql('));
    if (statusTests.length) console.log(`      Expected status: ${statusTests.map(s => s.match(/\d{3}/)?.[0]).filter(Boolean).join(', ')}`);
    if (propTests.length) {
      const props = propTests.flatMap(s => {
        const m = s.match(/\.(?:to\.have\.property|to\.eql)\s*\(\s*['"]([^'"]+)['"]/);
        return m ? [m[1]] : [];
      });
      if (props.length) console.log(`      Expected response: ${[...new Set(props)].join(', ')}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log('Summary: Create Wallet success expects data.wallet_id, data.wallet_key, data.xpub_hash');
  console.log('         Recover Wallet success expects data.wallet_key');
  console.log('         Generate Account XPUB success expects data.accounts (array)');
  console.log('         Sign Transaction success expects data.tx_data');
  console.log('='.repeat(80));
}

function main() {
  if (!fs.existsSync(COLLECTION_PATH)) {
    console.error('Collection not found:', COLLECTION_PATH);
    process.exit(1);
  }
  const collection = loadJson(COLLECTION_PATH);
  let env = null;
  if (fs.existsSync(ENV_PATH)) env = loadJson(ENV_PATH);
  const data = summarizeRequirements(collection, env);
  printReport(data);

  const outPath = path.join(REPO_ROOT, 'scripts', 'mpc-requirements-from-postman.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('\nFull JSON written to:', outPath);
}

main();
