const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "DuckDuckStudio";
const REPO_NAME = "Sitemap_Creator";
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID;
const WORKFLOW_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/runs/${GITHUB_RUN_ID}`;

const AUTO_BUG_REPORT = process.env.AUTO_BUG_REPORT || "";
const FAILURE_STEP = process.env.FAILURE_STEP || "";
const DEBUG = process.env.DEBUG || "";

// 清理自动错误报告开关
const CLEAN_AUTO_BUG_REPORT = AUTO_BUG_REPORT.toLowerCase().replace(/["'`-]/g, "");

console.log("[INFO] 此工作流似乎在某些地方出现了错误，正在检查是否启用了自动错误报告...");

if (DEBUG) {
  console.log(`[DEBUG] 清理后传入的自动错误报告开关: ${CLEAN_AUTO_BUG_REPORT}`);
}

if (CLEAN_AUTO_BUG_REPORT === "true" || CLEAN_AUTO_BUG_REPORT === "启用" || CLEAN_AUTO_BUG_REPORT === "开启" || CLEAN_AUTO_BUG_REPORT === "open") {
  console.log("[INFO] 自动错误报告已启用");

  if (DEBUG) {
    console.log(`[DEBUG] 获取到的出错步骤: ${FAILURE_STEP}`);
  }

  let issueBody = `> 这是一个由 [Sitemap Creator](https://github.com/DuckDuckStudio/Sitemap_Creator) 自动创建的错误报告。\n### 问题类别\n\n`;

  if (FAILURE_STEP.includes("权限")) {
    issueBody += "未能处理权限错误，请参阅文档以了解可能需要赋予的权限。\n";
  } else if (FAILURE_STEP.includes("参数")) {
    issueBody += "出现参数错误，请检查输入参数并参考调试输出。\n";
  } else {
    issueBody += `未匹配到任何错误分类: \n\`\`\`txt\n${FAILURE_STEP}\n\`\`\`\n\n`;
  }

  issueBody += `### 错误工作流链接\n\n${WORKFLOW_URL}\n\n### 使用的参数\n\n\`\`\`yml\ndebug: ${DEBUG}\nauto_bug_report: ${AUTO_BUG_REPORT}\nlocation: ${process.env.LOCATION}\nbasic_link: ${process.env.BASIC_LINK}\nfile_type: ${process.env.FILE_TYPE}\nignore_file: ${process.env.IGNORE_FILE}\nwebsite_path: ${process.env.WEBSITE_PATH}\nlabels: ${process.env.LABELS}\nauto_merge: ${process.env.AUTO_MERGE}\nupdate: ${process.env.UPDATE}\n\`\`\`\n\n`;

  // 构建 GitHub API 请求
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`;

  const issueData = {
    title: "[错误报告(未匹配)] 在运行工作流时出现未匹配的错误",
    body: issueBody
  };

  // 发送 POST 请求创建 Issue
  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(issueData)
  })
  .then(response => response.json())
  .then(data => {
    console.log("[INFO] 已提交错误报告", data);
  })
  .catch(error => {
    console.error("[ERROR] 提交错误报告失败:", error);
  });
} else {
  console.log("[INFO] 自动错误报告已禁用");
}
