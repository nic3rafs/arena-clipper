// scripts/update-version.js
import fs from 'fs';

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Please provide a version number as argument');
  process.exit(1);
}

try {
  // Update package.json
  const packagePath = './package.json';
  const packageContent = fs.readFileSync(packagePath, 'utf8');
  const packageJson = JSON.parse(packageContent);
  const oldVersion = packageJson.version;
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  
  // Update manifest.json
  const manifestPath = './manifest.json';
  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  const manifestJson = JSON.parse(manifestContent);
  manifestJson.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 2) + '\n');
  
  // Update manifest.firefox.json
  const ffManifestPath = './manifest.firefox.json';
  const ffManifestContent = fs.readFileSync(ffManifestPath, 'utf8');
  const manifestFirefoxJson = JSON.parse(ffManifestContent);
  manifestFirefoxJson.version = newVersion;
  fs.writeFileSync(ffManifestPath, JSON.stringify(manifestFirefoxJson, null, 2) + '\n');
  
  console.log(`✅ Version updated from ${oldVersion} to ${newVersion} in all files`);
} catch (error) {
  console.error(`❌ Error updating version: ${error.message}`);
  process.exit(1);
} 