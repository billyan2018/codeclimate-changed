import * as core from '@actions/core';
import * as fs from 'fs';
import addComments from './pr-comment';

const INPUT_FILE = 'raw_codeclimate.json';

interface FileLines {
  start: number;
  end: number;
}

export interface ModifiedFile {
  name: string;
  deletion?: FileLines[];
  addition?: FileLines[];
}
const token = core.getInput('token', { required: true });


async function run(): Promise<void> {

 
    const rawdata = fs.readFileSync(INPUT_FILE);

    const issuesInChangedFiles = JSON.parse(rawdata.toString());
    // core.info(`issues in changed files:${data}`);
    if (issuesInChangedFiles && issuesInChangedFiles.length > 0) {
      let message = 'This PR has the following issues:\n';
      issuesInChangedFiles.forEach((issue: any) => {
        message += `- [${issue.engine_name}-${issue.check_name}]: ${issue.location.path}: line: ${issue.location.lines.begin}: ${issue.description} \n`;
      });
      const commentResult = await addComments(message, token);
      core.info(`commentResult ${commentResult}`);
      //core.error(data);
      core.setFailed('The PR introduces new issues above');
      process.exit(core.ExitCode.Failure);
    }
  }


core.info('run');
run();
