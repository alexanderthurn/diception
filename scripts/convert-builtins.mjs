#!/usr/bin/env node
/**
 * Convert builtin-campaign.json, builtin-maps.json, builtin-scenarios.json
 * to campaign format (no name/description per level, owner field).
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS = join(__dirname, '../src/scenarios');

function sanitizeLevel(level) {
  const { name, description, author, isBuiltIn, ...rest } = level;
  return rest;
}

// 1. builtin-campaign.json
const campaignPath = join(SCENARIOS, 'builtin-campaign.json');
const campaign = JSON.parse(readFileSync(campaignPath, 'utf8'));

const convertedCampaign = {
  id: 'classic',
  owner: 'prebuilt-campaign',
  levels: campaign.levels.map(sanitizeLevel),
};

writeFileSync(campaignPath, JSON.stringify(convertedCampaign, null, 2));

// 2. builtin-maps.json -> campaign (overwrite)
const mapsPath = join(SCENARIOS, 'builtin-maps.json');
const maps = JSON.parse(readFileSync(mapsPath, 'utf8'));

const mapsCampaign = {
  id: 'maps',
  owner: 'prebuilt-maps',
  levels: maps.map(sanitizeLevel),
};

writeFileSync(mapsPath, JSON.stringify(mapsCampaign, null, 2));

// 3. builtin-scenarios.json -> campaign (overwrite)
const scenariosPath = join(SCENARIOS, 'builtin-scenarios.json');
const scenarios = JSON.parse(readFileSync(scenariosPath, 'utf8'));

const scenariosCampaign = {
  id: 'scenarios',
  owner: 'prebuilt-scenarios',
  levels: scenarios.map(sanitizeLevel),
};

writeFileSync(scenariosPath, JSON.stringify(scenariosCampaign, null, 2));

console.log('Converted: builtin-campaign.json');
console.log('Converted: builtin-maps.json');
console.log('Converted: builtin-scenarios.json');
