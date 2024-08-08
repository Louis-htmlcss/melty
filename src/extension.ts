import * as vscode from "vscode";
import * as path from "path";
import { HelloWorldPanel } from "./panels/HelloWorldPanel";
import { Conversation } from "./types";
import { Task } from "./backend/tasks";
import * as datastores from "./backend/datastores";
import * as utils from "./util/utils";

export class SpectacleExtension {
  private outputChannel: vscode.OutputChannel;
  private meltyMindFilePaths: string[] = [];
  private workspaceFilePaths: string[] | undefined;
  private tasks: Map<string, Task> = new Map();
  private currentTask: Task | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel;
  }

  async activate() {
    outputChannel.appendLine("Spectacle activation started");

    if (vscode.workspace.workspaceFolders) {
      this.tasks = datastores.loadTasksFromDisk(
        // TODO for now we assume gitRepo folder == workspace folder
        vscode.workspace.workspaceFolders![0].uri.fsPath
      );
    }

    // create a new task if there aren't any
    if (!this.tasks.size) {
      const taskId = await this.createNewTask(new Date().toLocaleString());
      this.currentTask = (this.tasks as Map<string, Task>).get(taskId);
    }

    // Set the first task as current
    this.currentTask = this.tasks.values().next().value;

    // kick off async inits. this will also be kicked off by callers who use this object
    // don't bother kicking off task.init() here; the git repo isn't ready.
    if (this.currentTask) {
      this.initializeWorkspaceFilePaths(this.currentTask);
    }
  }

  async deactivate(): Promise<void> {
    // The extension instance will be garbage collected, so we don't need to call deactivate explicitly
    for (const task of this.tasks.values()) {
      await datastores.writeTaskToDisk(task);
    }
  }

  public getMeltyMindFilePaths() {
    // TODO figure out why there are empty strings in the array
    return this.meltyMindFilePaths!.filter((path) => path !== "");
  }

  public async getWorkspaceFilePaths() {
    if (!this.currentTask) {
      throw new Error("No current task");
    }
    if (this.workspaceFilePaths === undefined) {
      if (!(await this.initializeWorkspaceFilePaths(this.currentTask))) {
        throw new Error("Could not initialize workspace file paths");
      }
    }
    return this.workspaceFilePaths!;
  }

  public listTasks(): { id: string; branch: string }[] {
    // don't include the git repo in the task object
    return Array.from(this.tasks.values()).map((task) => {
      return {
        id: task.id,
        branch: task.branch,
        name: task.name,
      };
    });
  }

  private async initializeWorkspaceFilePaths(task: Task): Promise<boolean> {
    if (this.workspaceFilePaths !== undefined) {
      return true;
    }

    if (!this.currentTask) {
      return false;
    }

    if (!(await this.currentTask.init())) {
      return false;
    }

    this.workspaceFilePaths = await utils.getWorkspaceFilePaths(this.currentTask.gitRepo!);
    return true;
  }

  public addMeltyMindFilePath(filePath: string) {
    this.meltyMindFilePaths.push(filePath);
    this.outputChannel.appendLine(`Added file: ${filePath}`);
  }

  public dropMeltyMindFilePath(filePath: string) {
    this.meltyMindFilePaths = this.meltyMindFilePaths.filter(
      (path) => path !== filePath
    );
    this.outputChannel.appendLine(`Dropped file: ${filePath}`);
  }

  public getConversation(taskId: string): Conversation {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }
    return task.conversation;
  }

  public getTask(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }
    return task;
  }

  public async createNewTask(taskName: string): Promise<string> {
    const taskId = `task_${new Date()}`;
    // const taskName = `${new Date().toLocaleString()}`
    // const branchName = `task/${taskName.replace(/\s+/g, "-")}`;

    const newTask = new Task(taskId, "", taskName);
    
    // kick off async (TODO see if this works)
    newTask.init();

    this.tasks.set(taskId, newTask);
    this.currentTask = newTask;

    return taskId;
  }

  public resetTask() {
    throw new Error("Not implemented");
  }

  public async switchToTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    // Switch to the task's branch
    // todo: add this back once testing is done
    // await this.checkoutGitBranch(task.branch);
    // vscode.window.showInformationMessage(`Switched to branch ${task.branch}`);

    this.currentTask = task;
    this.workspaceFilePaths = undefined; // Reset workspace file paths
    await this.initializeWorkspaceFilePaths(task); // Re-initialize workspace file paths
  }

  public openFileInEditor(filePath: string) {
    if (!this.currentTask || !this.currentTask.gitRepo) {
      throw new Error("No current task or git repository");
    }
    const fileUri = vscode.Uri.file(
      path.join(this.currentTask.gitRepo.rootPath, filePath)
    );
    vscode.window.showTextDocument(fileUri);
  }

  private async checkoutGitBranch(branchName: string): Promise<void> {
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    if (gitExtension) {
      const git = gitExtension.exports.getAPI(1);
      const repo = git.repositories[0];
      await repo.checkout(branchName);
    } else {
      throw new Error("Git extension not found");
    }
  }

  public async initRepository() {
    if (!this.currentTask) {
      throw new Error("No current task");
    }
    await this.currentTask.init();
  }

  public async getCurrentTask(): Promise<Task> {
    if (!this.currentTask) {
      throw new Error("No current task");
    }
    if (!this.currentTask.gitRepo) {
      console.log(`initializing task ${this.currentTask.id} repo`);
      await this.currentTask.init();
    }
    if (!this.workspaceFilePaths) {
      await this.initializeWorkspaceFilePaths(this.currentTask);
    }
    return this.currentTask;
  }

  private async createGitBranch(branchName: string): Promise<void> {
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    if (gitExtension) {
      const git = gitExtension.exports.getAPI(1);
      const repo = git.repositories[0];
      await repo.createBranch(branchName, true);
    } else {
      throw new Error("Git extension not found");
    }
  }
}

let outputChannel: vscode.OutputChannel;
let extension: SpectacleExtension;

export function activate(context: vscode.ExtensionContext) {
  console.log("Activating Spectacle extension");
  outputChannel = vscode.window.createOutputChannel("Spectacle");
  outputChannel.show();
  outputChannel.appendLine("Activating Spectacle extension");

  extension = new SpectacleExtension(context, outputChannel);
  extension.activate();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "spectacle.chatView",
      new HelloWorldPanel(context.extensionUri, extension)
    )
  );

  outputChannel.appendLine("Spectacle extension activated");
  console.log("Spectacle extension activated");
}

export async function deactivate(): Promise<void> {
  await extension.deactivate();
  console.log("Spectacle extension deactivated");
}