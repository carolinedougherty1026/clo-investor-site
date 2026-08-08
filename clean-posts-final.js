/**
 * Final pass for posts that already have Jekyll front matter added.
 * --------------------------------------------------------------------
 * Removes the now-redundant block that sits under the front matter:
 *   # Title
 *   Source: url
 *   ---
 *   Author Name
 *   Mon D
 *   X min read
 * (front matter already has title/date/author, so this was duplicating it)
 *
 * Also strips:
 *   - a trailing single-line category tag left at the very end of some
 *     posts (e.g. "CLO Analysis", "Market Trends", "NAV Updates",
 *     "In the News")
 *   - any stray cloinvestor.com/profile/... link line
 *
 * RUN from inside your Jekyll project folder (the one with _posts/):
 *   node clean-posts-final.js
 *
 * Backs up untouched originals into _posts-original/ the first time it
 * sees each file (never overwrites that backup on later runs).
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '_posts');
const BACKUP_DIR = path.join(__dirname, '_posts-original');

const CATEGORY_TAGS = new Set([
  'CLO Analysis',
  'Market Trends',
  'NAV Updates',
  'In the News',
]);

function stripRedundantHeader(body, frontMatterAuthor) {
  const lines = body.split('\n');
  let i = 0;

  const isBlank = (line) => line.trim() === '';

  // Skip leading blank lines.
  while (i < lines.length && isBlank(lines[i])) i++;

  // Remove a duplicated "# Title" heading line.
  if (i < lines.length && lines[i].trim().startsWith('# ')) {
    i++;
    while (i < lines.length && isBlank(lines[i])) i++;
  }

  // Remove a "Source: ..." line.
  if (i < lines.length && lines[i].trim().startsWith('Source:')) {
    i++;
    while (i < lines.length && isBlank(lines[i])) i++;
  }

  // Remove a lone "---" divider line.
  if (i < lines.length && lines[i].trim() === '---') {
    i++;
    while (i < lines.length && isBlank(lines[i])) i++;
  }

  // Remove a repeated byline: author name line, then a short date line
  // (e.g. "Apr 30"), then a "X min read" line. Author name is matched
  // loosely against the front-matter author (handles "Sean" vs
  // "Sean Dougherty").
  if (i < lines.length) {
    const candidate = lines[i].trim();
    const authorFirstName = frontMatterAuthor.split(' ')[0];
    if (candidate === frontMatterAuthor || candidate === authorFirstName) {
      i++;
      while (i < lines.length && isBlank(lines[i])) i++;
      // Date line, e.g. "Apr 30"
      if (i < lines.length && /^[A-Z][a-z]{2}\s+\d{1,2}$/.test(lines[i].trim())) {
        i++;
        while (i < lines.length && isBlank(lines[i])) i++;
      }
      // Read time line, e.g. "3 min read"
      if (i < lines.length && /^\d+\s+min read$/i.test(lines[i].trim())) {
        i++;
      }
    }
  }

  return lines.slice(i).join('\n').replace(/^\n+/, '');
}

function stripTrailingCategoryTag(body) {
  const lines = body.split('\n');
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && lines[lastIdx].trim() === '') lastIdx--;
  if (lastIdx >= 0 && CATEGORY_TAGS.has(lines[lastIdx].trim())) {
    return lines.slice(0, lastIdx).join('\n').trimEnd();
  }
  return body;
}

function stripStrayProfileLinks(body) {
  return body
    .split('\n')
    .filter((line) => !/cloinvestor\.com\/profile\//.test(line))
    .join('\n');
}

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.error(`Could not find ${POSTS_DIR}. Run this from your Jekyll project folder.`);
    process.exit(1);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') || f.endsWith('.markdown'));
  const summary = [];

  for (const file of files) {
    const filePath = path.join(POSTS_DIR, file);
    const original = fs.readFileSync(filePath, 'utf-8');

    const backupPath = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, original, 'utf-8');
    }

    const fmMatch = original.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) {
      summary.push(`${file}: SKIPPED (no front matter found)`);
      continue;
    }
    const [, frontMatterBlock, body] = fmMatch;

    const authorMatch = frontMatterBlock.match(/^author:\s*(.+)$/m);
    const author = authorMatch ? authorMatch[1].trim() : '';

    let cleanedBody = stripRedundantHeader(body, author);
    cleanedBody = stripTrailingCategoryTag(cleanedBody);
    cleanedBody = stripStrayProfileLinks(cleanedBody);
    cleanedBody = cleanedBody.trim() + '\n';

    const newContent = `---\n${frontMatterBlock}\n---\n\n${cleanedBody}`;
    fs.writeFileSync(filePath, newContent, 'utf-8');
    summary.push(`${file}: cleaned OK`);
  }

  console.log(summary.join('\n'));
  console.log(`\nDone. Processed ${files.length} files.`);
  console.log(`Originals backed up in: ${BACKUP_DIR}`);
}

main();
