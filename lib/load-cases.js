/**
 * Load adapter acceptance cases (language-agnostic JSON).
 * Package-local: cases.v1.json lives next to package root.
 * @module @coderifts/conformance/lib/load-cases
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CASES_PATH = path.join(__dirname, '..', 'cases.v1.json');

function loadCaseFile(filePath = CASES_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (raw.includes('\0')) {
    throw new Error(`null byte in case file: ${filePath}`);
  }
  const doc = JSON.parse(raw);
  if (!doc || doc.version !== 1 || !Array.isArray(doc.cases)) {
    throw new Error('cases.v1.json must be version 1 with a cases array');
  }
  return doc;
}

function filterByProfile(doc, profile) {
  if (!profile || profile === 'all' || profile === 'normative') {
    return doc.cases.filter((c) => !profile || !c.profiles
      || c.profiles.includes(profile) || profile === 'all');
  }
  return doc.cases.filter((c) => Array.isArray(c.profiles) && c.profiles.includes(profile));
}

module.exports = { loadCaseFile, filterByProfile, CASES_PATH };
