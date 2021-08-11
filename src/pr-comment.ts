import * as core from '@actions/core';
import * as github from '@actions/github';

async function addComments(message: string, repoToken: string): Promise<void> {
  try {
    core.info('start  to add comment');
    const context = github.context;
    if (context.payload.pull_request == null && context.payload.issue == null) {
        core.setFailed('No pull request or issue comment found.');
        return;
    }
    let issue_number: number | undefined;
    if (context.payload.pull_request != null) {
      issue_number = context.payload.pull_request.number;
    }
    if (context.payload.issue != null) {
      issue_number = context.payload.issue.number;
    }

    const octokit = github.getOctokit(repoToken);
    const result = await octokit.issues.createComment({
        ...context.repo,
        issue_number: issue_number as number,
        body: message
      });
    core.info(`add comment:${result} - ${issue_number}`);
  } catch (error) {
    core.setFailed(error.message);
    return;
  }
};

export default addComments;