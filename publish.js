const { spawnSync } = require('child_process');
const readline = require('readline/promises');
const path = require('path');

const projectRoot = __dirname;
process.chdir(projectRoot);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    stdio: options.capture ? 'pipe' : 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout || '').trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return options.capture ? (result.stdout || '').trim() : '';
}

async function triggerRenderDeploy() {
  const hookValue = (process.env.RENDER_DEPLOY_HOOK_URL || '').trim();
  if (!hookValue) return false;

  const hook = new URL(hookValue);
  if (hook.protocol !== 'https:') throw new Error('RENDER_DEPLOY_HOOK_URL must use HTTPS.');

  console.log('[5/5] Triggering the configured Render deploy hook...');
  const response = await fetch(hook, { method: 'POST', redirect: 'error' });
  if (!response.ok) throw new Error(`Render deploy hook failed with HTTP ${response.status}.`);
  console.log('Render deploy hook accepted the deployment request.');
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let message = args.filter(arg => arg !== '--dry-run').join(' ').trim();
  if (!message && !dryRun && process.stdin.isTTY) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    message = (await prompt.question('Commit message: ')).trim();
    prompt.close();
  }
  message ||= 'chore: publish site update';

  console.log('[1/5] Validating the application...');
  run(process.execPath, ['--check', 'app.js']);
  run(process.execPath, ['verify.js']);

  const branch = run('git', ['branch', '--show-current'], { capture: true });
  if (branch !== 'main') throw new Error(`Publishing is allowed only from main (current: ${branch || 'detached HEAD'}).`);

  if (dryRun) {
    const changes = run('git', ['status', '--short'], { capture: true });
    console.log(changes || 'Working tree is clean.');
    console.log('Dry run complete. No commit, push, or deployment was performed.');
    return;
  }

  console.log('[2/5] Synchronizing with origin/main...');
  run('git', ['fetch', 'origin', 'main']);

  const changes = run('git', ['status', '--porcelain'], { capture: true });
  if (changes) {
    console.log(`[3/5] Creating commit: ${message}`);
    run('git', ['add', '--all']);
    run('git', ['commit', '-m', message]);
  } else {
    console.log('[3/5] No new working-tree changes to commit.');
  }

  run('git', ['rebase', 'origin/main']);
  const commitsToPush = Number(run('git', ['rev-list', '--count', 'origin/main..HEAD'], { capture: true }));

  console.log('[4/5] Pushing main to GitHub...');
  run('git', ['push', 'origin', 'main']);

  const hookTriggered = await triggerRenderDeploy();
  if (!hookTriggered) {
    if (commitsToPush > 0) console.log('[5/5] Push complete. A Render service linked to this repo will auto-deploy the new main commit.');
    else console.log('[5/5] Nothing new was pushed, so Git-based auto-deploy was not triggered.');
  }

  console.log('Publish completed successfully.');
}

main().catch(error => {
  console.error(`Publish failed: ${error.message}`);
  process.exitCode = 1;
});
