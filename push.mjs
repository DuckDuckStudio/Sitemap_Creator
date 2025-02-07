import { execSync } from 'child_process';
import https from 'https';

// 获取当前日期和时间
const DATE_TIME = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

// 提交者名和邮箱
const AUTHOR_NAME = process.env.AUTHOR_NAME.replace(/[\"\'\`]/g, '');
const AUTHOR_EMAIL = process.env.AUTHOR_EMAIL.replace(/[\"\'\`]/g, '');

// 参数处理
let UPDATE_WAY = process.env.UPDATE.toLowerCase().replace(/[\"\'\`-]/g, '').replace(/\s/g, '');
let CLEAN_AUTO_MERGE = '';
let CLEAN_LABELS = '';
let CLEAN_REVIEWER = '';
let BRANCH_NAME = '';

if (['pr', 'pullrequest', 'pullrequests', 'prs', '拉取请求'].includes(UPDATE_WAY)) {
    UPDATE_WAY = 'PR';
    if (process.env.DEBUG) {
        console.log('[DEBUG] 更新方式: 创建拉取请求');
    }

    if (!process.env.AUTO_MERGE) {
        if (process.env.DEBUG) {
            console.log('[DEBUG] 不启用自动合并，因为自动合并方式为空');
        }
    } else {
        CLEAN_AUTO_MERGE = process.env.AUTO_MERGE.toLowerCase().replace(/[\"\'\`-]/g, '');
        if (['s', 'squash', '压缩', '压缩合并', '压缩自动合并'].includes(CLEAN_AUTO_MERGE)) {
            CLEAN_AUTO_MERGE = 'squash';
        } else if (['m', 'merge', '合并', '合并提交', '提交'].includes(CLEAN_AUTO_MERGE)) {
            CLEAN_AUTO_MERGE = 'merge';
        } else if (['r', 'rebase', '变基', '变基合并', '变基自动合并'].includes(CLEAN_AUTO_MERGE)) {
            CLEAN_AUTO_MERGE = 'rebase';
        } else {
            console.error(`[ERROR] 未知的自动合并方式: ${process.env.AUTO_MERGE}`);
            console.error('[TIP] 可用的自动合并方式: 压缩、合并、变基');
            process.exit(1);
        }
    }

    if (process.env.AUTO_MERGE !== CLEAN_AUTO_MERGE && process.env.DEBUG) {
        console.log(`[DEBUG] 已格式化自动合并方式: ${process.env.AUTO_MERGE} -> ${CLEAN_AUTO_MERGE}`);
    }

    CLEAN_LABELS = process.env.LABELS.replace(/[\"\'\`]/g, '');
    if (process.env.LABELS !== CLEAN_LABELS && process.env.DEBUG) {
        console.log(`[DEBUG] 标签包含特殊字符，已移除: ${process.env.LABELS} -> ${CLEAN_LABELS}`);
    }

    CLEAN_REVIEWER = process.env.REVIEWER.replace(/[\"\'\`]/g, '');
    if (process.env.REVIEWER !== CLEAN_REVIEWER && process.env.DEBUG) {
        console.log(`[DEBUG] 审查者信息包含特殊字符，已移除: ${process.env.REVIEWER} -> ${CLEAN_REVIEWER}`);
    }

    if (CLEAN_REVIEWER) {
        const reviewers = CLEAN_REVIEWER.split(',');
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${process.env.GITHUB_REPOSITORY}/collaborators`,
            headers: {
                'Authorization': `token ${process.env.TOKEN}`,
                'User-Agent': 'node.js'
            }
        };

        const validateReviewers = () => {
            return new Promise((resolve, reject) => {
                https.get(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        const statusCode = res.statusCode.toString();
                        const collaborators = JSON.parse(data);

                        if (['200', '201'].includes(statusCode)) {
                            reviewers.forEach(reviewer => {
                                const isCollaborator = collaborators.some(collaborator => collaborator.login === reviewer);
                                if (!isCollaborator) {
                                    reject(`[ERROR] ${reviewer} 不是仓库的协作者`);
                                } else if (process.env.DEBUG) {
                                    console.log(`[DEBUG] 审查者 ${reviewer} 鉴权成功`);
                                }
                            });
                            resolve();
                        } else if (statusCode === 401) {
                            reject('[ERROR] 验证审查者时出错: 鉴权失败 (401):');
                        } else if (statusCode === 403) {
                            reject('[ERROR] 验证审查者时出错: 没有权限或达到速率限制 (403)');
                        } else if (statusCode === 404) {
                            reject('[ERROR] 验证审查者时出错: 没有权限或仓库不存在 (404)');
                        } else {
                            reject(`[ERROR] 验证审查者时出错: 未命中的非成功状态码 (${statusCode})`);
                        }
                    });
                }).on('error', (e) => {
                    reject(`[ERROR] 请求失败: ${e.message}`);
                });
            });
        };

        try {
            await validateReviewers();
        } catch (error) {
            console.error(error);
            process.exit(1);
        }
    }

    const now = new Date();
    BRANCH_NAME = `sitemap-update-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    execSync(`git checkout -b ${BRANCH_NAME}`);
    console.log(`[INFO] 已创建新分支: ${BRANCH_NAME}`);
} else if (['commit', '提交', '直接提交', 'directcommit', 'commitdirectly'].includes(UPDATE_WAY)) {
    UPDATE_WAY = 'Commit';
    if (process.env.DEBUG) {
        console.log('[DEBUG] 更新方式: 直接提交到主分支');
    }

    const params = ['LABELS', 'AUTO_MERGE'];
    params.forEach(paramName => {
        const paramValue = process.env[paramName];
        if (paramValue) {
            console.error('[ERROR] 错误的参数传递');
            console.error(`[TIP] ${paramName} 参数不得与更新方式“提交”共存`);
            process.exit(1);
        }
    });
} else {
    console.error(`[ERROR] 未知的更新方式: ${process.env.AUTO_MERGE}`);
    console.error('[TIP] 可用的更新方式: 提交、拉取请求');
    process.exit(1);
}

// 配置 Git 用户
execSync(`git config user.name "${AUTHOR_NAME}"`);
execSync(`git config user.email "${AUTHOR_EMAIL}"`);

// 提交并推送 sitemap.xml
execSync(`git add "${process.env.LOCATION}"`);
execSync(`git commit -m "[${DATE_TIME}] 自动更新网站地图"`);
execSync('git config --global push.autoSetupRemote true');
execSync('git push');

if (UPDATE_WAY === 'PR') {
    const WORKFLOW_URL = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    const PR_URL = execSync(`gh pr create --title "[${DATE_TIME}] 自动更新网站地图" --body "此拉取请求通过 [工作流](${WORKFLOW_URL}) 使用 [Sitemap Creator](https://github.com/DuckDuckStudio/Sitemap_Creator) 创建。" --base ${process.env.BASE_BRANCH} --head ${BRANCH_NAME}`).toString().trim();
    console.log(`[INFO] 已创建拉取请求: ${PR_URL}`);

    if (CLEAN_LABELS) {
        execSync(`gh pr edit "${PR_URL}" --add-label "${CLEAN_LABELS}"`);
        console.log(`[INFO] 已为创建的拉取请求添加标签: ${CLEAN_LABELS}`);
    } else if (process.env.DEBUG) {
        console.log('[DEBUG] 没有有效标签，跳过添加标签');
    }

    if (CLEAN_REVIEWER) {
        execSync(`gh pr edit "${PR_URL}" --add-reviewer "${CLEAN_REVIEWER}"`);
        console.log(`[INFO] 已为创建的拉取请求添加审查者: ${CLEAN_REVIEWER}`);
    } else if (process.env.DEBUG) {
        console.log('[DEBUG] 没有有效审查者，跳过添加审查者');
    }

    if (CLEAN_AUTO_MERGE) {
        execSync(`gh pr merge "${PR_URL}" --${CLEAN_AUTO_MERGE} --auto`);
        console.log(`[INFO] 已为拉取请求启用 ${CLEAN_AUTO_MERGE} 合并`);
    } else if (process.env.DEBUG) {
        console.log('[DEBUG] 没有有效自动合并方式，跳过启用自动合并');
    }
}
