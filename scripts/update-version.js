// scripts/update-version.js
import fs from 'fs';

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Please provide a version number as argument');
  process.exit(1);
}

// Update package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
packageJson.version = newVersion;
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2) + '\n');

// Update manifest.json
const manifestJson = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
manifestJson.version = newVersion;
fs.writeFileSync('./manifest.json', JSON.stringify(manifestJson, null, 2) + '\n');

// Update manifest.firefox.json
const manifestFirefoxJson = JSON.parse(fs.readFileSync('./manifest.firefox.json', 'utf8'));
manifestFirefoxJson.version = newVersion;
fs.writeFileSync('./manifest.firefox.json', JSON.stringify(manifestFirefoxJson, null, 2) + '\n');

console.log(`Version updated to ${newVersion} in all files`); 