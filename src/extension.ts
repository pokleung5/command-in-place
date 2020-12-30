import * as vscode from 'vscode';
import { resolve } from 'path';
import { Transform } from 'stream';

const EXTENSION_NAME = "command-in-place"
const fn_symbol = "%fn%";
const delim = getConfig<string>("delimForTime");

function getConfig<T>(configPath: string): T {
	return vscode.workspace.getConfiguration().get(EXTENSION_NAME + "." + configPath) as T;
}

const outWin = vscode.window.createOutputChannel(EXTENSION_NAME);

export function activate(context: vscode.ExtensionContext) {

	var l_command = fn_symbol;

	let disposable = vscode.commands.registerCommand(EXTENSION_NAME + '.runCommand',
		async () => {
			const command = await vscode.window.showInputBox({
				placeHolder: 'Enter a command',
				value: l_command
			});

			const editor = vscode.window.activeTextEditor;

			if (command == undefined || editor == undefined) {
				return 1;
			}

			let n_command = command;
			l_command = command;

			let term = getConfig<string>("term");

			if (command.includes(fn_symbol)) {
				let fn_path = editor.document.uri.fsPath;

				if (fn_path.includes(":")) {
					if (term === 'cmd') {
						n_command = command.replace(fn_symbol, fn_path);
					} else {
						fn_path = "\\" + fn_path.replace(":", "");
						fn_path = fn_path.replace(/\\/g, "/");

						n_command = command.replace(fn_symbol, fn_path);
					}
				}
				else {
					vscode.window.showErrorMessage(
						"Uri not correct: " + editor.document.uri.toString()
					);
					return 0;
				}
			}

			await Promise.all(editor.selections.map(selection =>
				exec(term, n_command, editor.document.getText(selection))
			)).then(resolves => {
				editor.edit(editBuilder => {
					editor.selections.forEach((selection, index) => {
						editBuilder.replace(selection, resolves[index]);
					});
				});
			}).catch(rejects => {
				outWin.clear();
				outWin.append(rejects);

				vscode.window.showErrorMessage("Please check output window !");
				outWin.show();
			});

		});

	context.subscriptions.push(disposable);
}

export function deactivate() { }

function exec(term: string, command: string, input: string): Promise<string> {
	let spawn = require('child_process').spawn;

	let options = getConfig<Array<string>>("options").join(" ");
	let timeout = getConfig<number>("timeout");

	if (command.includes(delim)) {
		timeout = parseInt(command.split(delim)[1]);
		command = command.split(delim)[0];
	}

	let cmd = spawn(term, [options, command]);
	let timeoutID = setTimeout(function () {
		cmd.kill();
		vscode.window.showErrorMessage('Time out !!');
	}, timeout);

	if (input) {
		cmd.stdin.write(input);
		cmd.stdin.end();
	}

	let outStr = "";
	cmd.stdout.on('data', function (data: any) {
		outStr += data.toString();
	});

	let errStr = "";
	cmd.stderr.on('data', function (err: any) {
		errStr += err.toString();
	});

	return new Promise((resolve, reject) => {
		cmd.on('close', function (code: any) {
			clearTimeout(timeoutID);
			if (code == 0) {
				resolve(outStr);
			}
			else {
				if (errStr === "")
					reject(outStr);
				else
					reject(errStr);
			}
		});
	});
}