#!/usr/bin/env bash
# The only supported way to deploy this app (README "Deploying to Vercel"): a prebuilt CLI deployment whose output is
# scanned for secrets before anything is uploaded (adapted from shopping-list-app).
#
#   npm run deploy:preview      preview deployment (Vercel-protected; no Claude key, so Demo runs the quota flow)
#   npm run deploy:production   production deployment, NOT live yet (--skip-domain): verify it, then
#                               `vercel promote <url>`; roll back with `vercel rollback`
#
# 1. deploy-guard check     .vercelignore / vercel.json committed, no secret file tracked, .vercel ignored
# 2. vercel pull + build    project settings and non-sensitive env into .vercel/ (gitignored), build locally;
#                           --standalone copies every function file into .vercel/output, so step 3 sees all of it
# 3. deploy-guard prebuilt  .vercel/output holds no env file, key-shaped string or local secret value
# 4. vercel deploy --prebuilt   uploads .vercel/output only
set -euo pipefail
cd "$(dirname "$0")/.."

target=${1:-}
case "$target" in
  preview) build=(vercel build --standalone --target=preview); deploy=(vercel deploy --prebuilt --target=preview) ;;
  production) build=(vercel build --prod --standalone); deploy=(vercel deploy --prebuilt --prod --skip-domain) ;;
  *) echo "usage: scripts/deploy.sh preview|production" >&2; exit 2 ;;
esac

[ -f .vercel/project.json ] || { echo "deploy: not linked. Run 'vercel link' in your personal Vercel account (never a company team)." >&2; exit 1; }
echo "Vercel account: $(vercel whoami 2>/dev/null)  ·  target: $target"
# Vercel promotes a new project's first deployment to production even when it was built for preview (2026-11-03).
if [ "$target" = preview ]; then
  project=$(node -p "require('./.vercel/project.json').projectId")
  vercel api "/v6/deployments?projectId=$project&target=production&limit=1" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.exit(JSON.parse(s).deployments?.length?0:1))" \
    || { echo "deploy: the project has no production deployment yet, so Vercel would promote this preview to production. Refusing." >&2; exit 1; }
fi
if [ "$target" = production ] && [ "${DEPLOY_CONFIRM:-}" != production ]; then
  read -r -p "Deploy to PRODUCTION (not promoted yet)? Type 'production': " answer
  [ "$answer" = production ] || { echo "Cancelled."; exit 1; }
fi

node scripts/deploy-guard.mjs check
vercel pull --yes --environment="$target"
"${build[@]}"
node scripts/deploy-guard.mjs prebuilt
"${deploy[@]}"
