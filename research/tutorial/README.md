# Lab Session #X: Deployment of Serverless Application using the Serverless Framework
In this lab session, you will explore the Serverless Framework to deploy cloud-based applications efficiently. Instead of manual server management, you will use Infrastructure as Code (IaC) to define resources, manage cloud permissions, and utilize modern development tools for real-time debugging.

## Pre-lab homework
This should be done before the lab session. 

### 1. Download the code
Download the [serverless-framework repository]() as a ZIP file and add it to your project repository. 

### 2. Create a Account for Serverless Framework
To use the Serverless Framework for deployments and monitoring, you first need to create a cloud account. Follow this [link to the Serverless Framework](https://app.serverless.com/) to sign up and create your user profile.

## Objectives
* Deploy a serverless application to AWS: Learn to automate the provisioning of Lambda functions, API Gateway, and DynamoDB.

* Master Real-time Debugging: Use serverless dev to bridge your local environment with the cloud for instant feedback and live logging.

* Implement Infrastructure as Code (IaC): Understand how cloud architecture and IAM permissions are defined in the serverless.yml configuration file.

* Manage Cloud Lifecycle: Practice the full process of scaffolding, updating, and safely removing cloud resources via the CLI.

## Background Information
**Serverless computing** allows you to build and run applications without the burden of managing servers. Instead of provisioning hardware, you deploy code that scales automatically, and you only pay for the exact resources your code consumes. This labs builds up on the Lab about [Serverless Application](https://github.com/CCBDA-UPC/Assignments-2026_spring/blob/main/Lab06.md) threre to concept of **serverless applications** was introducedand, this labs focuses on how to simplify and optimize the developer workflow using the Serverless Framework. 

### 1. What is the Serverless Framework?
The Serverless Framework acts as a powerful abstraction layer that sits on top of cloud providers, such as AWS. Instead of requiring you to manually log into the AWS Management Console and use "point and click" methods to create resources as we did in the [Serverless Application Lab](https://github.com/CCBDA-UPC/Assignments-2026_spring/blob/main/Lab06.md), the tool functions as a bridge that translates your requirements into cloud infrastructure.

This is achieved through Infrastructure as Code (IaC). IaC means that you define your entire IT environment, including everything from databases and servers to security permissions, in the form of configuration files. In this lab, you will use the serverless.yml file for this purpose. By defining your infrastructure as code, the entire setup becomes versionable, repeatable, and automated. This minimizes the risk of human error and allows you to deploy the exact same environment over and over again with a single command.

### 2. Why use the Serverless Framework?
The primary goal of using a framework is to move away from administrative tasks and focus on building features. Below are the key advantages of this approach:

* **Focus on Business Logic**: Instead of spending hours configuring operating systems, patching servers, or setting up scaling policies, developers can focus entirely on writing the code (Functions) that delivers value to the user.

* **Automated Orchestration**: The framework handles the "plumbing" of your application. It automatically creates the necessary triggers (Events) and provisions the required backend tools (Resources), such as databases or storage buckets, ensuring they are correctly connected.

* **Enhanced Developer Experience (DX)**: Modern tools like serverless dev synchronize your local code changes with the cloud in seconds. This provides a fast feedback loop with live logging and real-time debugging, which is significantly more efficient than traditional deployment cycles.

* **Security and Compliance**: By defining Identity and Access Management (IAM) permissions directly in your code, you ensure that your application follows the principle of least privilege. This makes security a part of the development process rather than an afterthought.

### 3. Comparison: Manual Console vs. Serverless Framework
| Feature | Manual AWS Console | Serverless Framework (IaC) |
| :--- | :--- | :--- |
| **Deployment Speed** | Slow; requires dozens of manual clicks and uploads. | Rapid; the entire stack is deployed with one command. |
| **Consistency** | High risk of human error and configuration mistakes. | Guaranteed; the same code always creates the exact same environment. |
| **Documentation** | Infrastructure settings are hidden inside various menus. | The `serverless.yml` file acts as live documentation of the system. |
| **Scaling the Setup** | Hard to replicate for testing or production. | Effortless; use "stages" to clone the environment in seconds. |

## Lab Tasks Overview
- Task 1.1: Enable your laptop to access AWS resources
- Task 1.2: Install and configure the Serverless Framework
- Task 1.3: Initial Deployment to AWS using the Serverless Framework
- Task 1.4  Development and debugging using Serverless Framework
- Task 1.5: Multi-Cloud Theoretical Comparison
- Task 1.6: How to Submit this Assignment

# Task 1.1: Enable your laptop to access AWS resources
Using the AWS console, create a new programmatic user named serverless_framework_user. This account will be used by the Serverless Framework on your laptop to provision resources in your AWS account. 

### 1. Create the IAM user and generate Access Keys
1. **Log in** to the [AWS Management Console](https://console.aws.amazon.com/).
2. **Navigate to IAM**: Search for **IAM** (Identity and Access Management) and select **IAM Users** > **Create user**.
3. **User details**: Name the user `serverless_framework_user` and click **Next**.
4. **Set permissions**: 
    * Select **Attach policies directly**
    * Search for and select **IAMFullAccess** by checking the box to the left. 
    * *Note: This allows your CLI to manage other permissions later.*
5. **Create User**:, now press **Create** to create the user.

### 2. Create Access Keys
There will now be a new user named `serverless_framework_user` that can be found in the list under **IAM users**. Now we will **Generate Keys** for the user: 

1. Click on your newly created user in the list. **Go to** the **Security credentials** tab.
2. **Scroll down** to the **Access keys** section and click **Create access key**.
3. **Select CLI**: Choose **Command Line Interface (CLI)** as the use case.
4. **Download credentials**: Click **Next** and then **Download .csv file** or copy both the **Access Key ID** and **Secret Access Key**.
    
> [!WARNING]
> **Store safely**: This is the only time you can view the Secret Access Key. You will not be able to see it again once you leave this page.

### 3. IAM Configuration
Ensure that you have the ASW CLI installed on your machine. Then configure your local environment with the credentials obtained from the AWS Console:
```bash
_$ aws configure
AWS Access Key ID [None]: <YOUR-AWS-ACCESS-KEY-ID>
AWS Secret Access Key [None]: <YOUR-AWS-SECRET-ACCESS-KEY>
Default region name [None]: eu-west-1
Default output format [None]: json
```
### 4. Verify identity
Run the following command to verify that your CLI is correctly linked to the new user:

```bash
_$ aws sts get-caller-identity
```
### 5. Granting Necessary Permissions
To allow the Serverless Framework to manage your infrastructure, you need to attach a set of managed policies to your user.

Run the following commands in your terminal to attach the required policies to `serverless_framework_user`:
```bash
# Define the username
_$ USER_NAME="serverless_framework_user"

# Attach required policies
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AmazonSSMFullAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AWSIoTConfigReadOnlyAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AWSIoTDataAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
_$ aws iam attach-user-policy --user-name ${USER_NAME} --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
```
### 6. Verify Attached Policies
Finally, confirm that all policies have been successfully attached:

```bash
_$ aws iam list-attached-user-policies --user-name ${USER_NAME}
```
 
# Task 1.2: Install and configure the Serverless Framework
In the previous task, you successfully linked your laptop to your AWS account. Now, it is time to install and configure the **Serverless Framework**.

### 1. Prerequisites: Node.js and npm
Before installing the Serverless Framework, you must have **Node.js** installed on your machine. Check if you have it downloaded by running: 

```bash
_$ node -v
_$ npm -v
```
**If not installed**: Go to [nodejs.org](https://nodejs.org/en/download/package-manager) and download the **LTS (Long Term Support)** version. Run the installer and follow the instructions. After installation, restart your terminal to ensure `npm` is recognized.

### 2. Install the Serverless Framework
Now it is time to install the framework itself. We will use npm to install it globally on your machine so that you can run the serverless command from any folder.

```bash
_$ npm install -g serverless
```
Once the installation is complete, check that it's working by asking for the version number: 
```bash
_$ serverless --version
```
You should see a version number (e.g., 4.x.x) and some information about your environment. 

>[!IMPORTANT] Ensure you are using Version 4.x or higher. > Version 4 is required to support the latest features, such as Serverless Dev Mode which will be used later in this lab. 

### 3. Login to Serverless Framework account
You previously created an account at app.serverless.com (if not see instructions at **Prelab-homework**). Now, you need to authenticate your terminal so it can communicate with your dashboard. Run the command:
```bash
_$ serverless login
```
Your default browser will open automatically and take you to the Serverless login page. If you not already logged into the website login to your account. Once the browser says **Login successful**, you can close the tab and return to your terminal. Your terminal will update automatically to confirm that you are now linked to your account. 

# Task 1.3: Initial Deployment to AWS using the Serverless Framework
In this part of the lab, we will use a boilerplate (a pre-made template) provided by the Serverless Framework. This allows you to quickly set up the foundational structure of your application without writing everything from scratch.

### 1. Generate Boilerplate

1. In the terminal make sure that you stand in the project mapp `lab-code`. If not navigate to it:
```bash
_$ cd lab-code
```
2. Run the command `_$ serverless`, this will show you the diffrent templates avaiabel.
```bash
_$ serverless
```
3. Select the template named: `AWS / Node.js / HTTP API` and press **Enter**.

4. Name your project: `serverless-project-tutorial`.

5. Select **Create App** and name it **serverless-labs**.

### 2. Understanding the core components
After completing the setup, a new folder named serverless-project-tutorial has been created inside your lab-code directory. Open this folder in your code editor and you will find the files **serverless.yml** and **handler.js**, togheter they form a complete cloud application.

* **serverless-yml**: This file acts as the architect's drawing for your AWS infrastructure. It tells the Serverless Framework to create the components defined in the `serverless.yml` file inside aws. We will soon take a closer look at the content of `serverless.yml` file to get an better understanding of hor it works. 

* **handler.js**: This file contains the logic of the program that will be executed by a Lambda function. 

### 3. Deployment of Application
Now it time to actualy deploy this application to **AWS** using the serverless framework:

1. **Navigate to folder**: Make sure that you stand in the directory where your `serverless.yml` file is located. 
```bash
_$ cd serverless-project-tutorial
```
2. **Deploy the application**: Run the following command to start the deployment process: (usually takes 1-2 minutes)
```bash
_$ serverless deploy
```
3. **Your endpoint**: Once the deployment is finished, look at the output in your terminal. Under the endpoints section, you will see a URL. 
    * Click the URL or Copy and Pase it into your web browser.
4. If the deployment was successful, you will see a JSON message confirming that your function is live in the cloud:
```json
{"message":"Go Serverless v4! Your function executed successfully!"}
```
### 4. Verify in the AWS Management Console
Now that your app is live, let’s look "under the hood" to see what the Serverless Framework actually built for you in the AWS cloud. This step is crucial to understand how the `serverless.yml` was translated into real resources.

1. Go to the [AWS Management Console](https://aws.amazon.com/console/) and sign in to your account. 
2. Search for **CloudFormation** in the AWS Console search bar.
3. In the list of "Stacks," find the one named `serverless-project-tutorial-dev`. This is the collection of all resources created for your project.
4. Click on the stack name and navigate to the **Resources** tab. Here you can see all the resources for the deployed application.
>:question: **Question 1**: Provide a screenshot of the Resources tab for your deployment. Ensure the columns "Logical ID" and "Type" are visible.

>:question: **Question 2**: In your serverless.yml file, you only defined one function under the functions section. However, in the CloudFormation list, you see several resources related to Lambda (e.g., ApiHandlerLambdaFunction, LambdaPermission, and IamRoleLambdaExecution). Why do you think AWS creates these "extra" resources instead of just the function itself?

## Task 1.4: Development and debugging using Serverless Framework
In this section, we will transform our simple "Hello World" function into a fully functional Serverless Web Application.

### 1. Update the serverless.yml file
Replace the current content of your `serverless.yml` with the code below:

```yaml
org: ccbda

app: serverless-labs

service: research-project-tutorial

provider:
  name: aws
  runtime: nodejs22.x  
  region: eu-west-1
  stage: dev
  
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - dynamodb:PutItem
            - dynamodb:Scan
          Resource: 
            - !GetAtt DataTable.Arn

functions:
  apiHandler:
    handler: handler.hello
    events:
      - httpApi:
          path: /data
          method: ANY

resources:
  Resources:
    DataTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ResearchDataTable
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        BillingMode: PAY_PER_REQUEST
```
### 2. serverless.yml file
To work with Serverless framework you need to understand the fundamental pillars. They define how your code, triggers, and infrastructure work together in the cloud.

* **Function**: A Function is the actual logic you write (e.g., in Node.js). In AWS, these are called Lambda functions. They are independent "microservices" that only run when called.

* **Events**: Events are what "wake up" your functions. A function does nothing until an event occurs. The framework automatically sets up the infrastructure (like an API Gateway) to connect the event to your code.

* **Resources**: Resources are the external components your functions need to do their job. These are defined using AWS CloudFormation syntax.

* **Service**: A Service is your entire project unit. It is defined by your `serverless.yml` file. Think of it as a container that holds your code and all the infrastructure it needs. When you deploy, the entire service is uploaded to AWS as a single "Stack."

More documentation and information about these concepts and how they are used and defined to create serverless application can be find in the [documentation](https://www.serverless.com/framework/docs/providers/aws/guide/intro)


> :question: **Question 3**: Look in the serverless.yml file and try to identify what type of AWS resource that is being defined by this configuration file?

> :question: **Question 4**: Look at the functions defined here, what is the name of the function? What specific URL path and HTTP method will trigger this function to execute?

## 3. Update Lambda logic
Now it’s time to breathe life into our application. We are going to replace the simple "Hello World" code with a much smarter function.

Copy and paste this code into your handler.js file, replacing everything that was there before:

```javascript
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Helper function to handle CORS and responses
const sendResponse = (statusCode, body, contentType = 'application/json') => {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*', 
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    };
};

module.exports.hello = async (event) => {
    const method = event.requestContext.http.method;
    const tableName = "ResearchDataTable";

    try {
        // --- 1. FRONTEND: Serve HTML ---
        if (method === 'GET' && !event.headers['accept']?.includes('application/json')) {
            const htmlPath = path.join(__dirname, 'index.html');
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            return sendResponse(200, htmlContent, 'text/html; charset=utf-8');
        }

        // --- 2. API: Save Data (POST) ---
        if (method === 'POST') {
            const data = JSON.parse(event.body || '{}');
            const item = { 
                id: crypto.randomUUID(), 
                text: data.text || "No message", 
                timestamp: new Date().toLocaleString('sv-SE') 
            };

            await docClient.send(new PutCommand({
                TableName: ErrorName,
                Item: item
            }));

            return sendResponse(200, { success: true, item });
        }

        // --- 3. API: Fetch Data (GET JSON) ---
        const result = await docClient.send(new ScanCommand({ TableName: tableName }));
        return sendResponse(200, result.Items);

    } catch (err) {
        console.error(err);
        return sendResponse(500, { error: err.message });
    }
};
```
## 4. Create the Frontend User Interface
The final piece of the puzzle is the user interface. Create a new file in your project folder named `index.html` and paste the code below.

Copy this Code into the index.html: 
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Serverless Storage</title>
    <style>
        body { font-family: sans-serif; padding: 40px; background-color: #f9f9f9; display: flex; justify-content: center; }
        .container { max-width: 500px; width: 100%; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-top: 0; }
        input { padding: 10px; width: 70%; border: 1px solid #ccc; border-radius: 4px; outline: none; }
        button { padding: 10px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        button:hover { background: #0056b3; }
        
        .db-header { margin-top: 30px; font-weight: bold; color: #555; border-bottom: 2px solid #eee; padding-bottom: 5px; }
        #list { margin-top: 10px; }
        .item-card { 
            background: #fff; 
            border: 1px solid #ddd; 
            padding: 15px; 
            margin-bottom: 10px; 
            border-radius: 6px;
            border-left: 4px solid #28a745; 
            text-align: left;
        }
        .item-card small { color: #999; display: block; margin-bottom: 5px; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Serverless Storage</h1>
        <p>Enter a message to save it in DynamoDB:</p>
        
        <div style="display: flex; gap: 10px;">
            <input type="text" id="inp" placeholder="Type something...">
            <button onclick="saveData()">Save</button>
        </div>

        <div class="db-header">Saved in Database:</div>
        <div id="list">Loading messages...</div>
    </div>

    <script>
        const API_URL = window.location.href;

        async function saveData() {
            const text = document.getElementById('inp').value;
            if(!text) return;

            document.getElementById('list').innerHTML = "Saving...";
            
            try {
                await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                
                document.getElementById('inp').value = '';
                loadData();
            } catch (e) {
                alert("Error saving data");
            }
        }

        async function loadData() {
            try {
                const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
                const data = await res.json();
                const listDiv = document.getElementById('list');
                
                if (!data || data.length === 0) {
                    listDiv.innerHTML = "<p style='color:#999;'>No data found.</p>";
                } else {
                    listDiv.innerHTML = data.map(item => `
                        <div class="item-card">
                            <small>Saved at: ${item.timestamp || 'Unknown'}</small>
                            <strong>${item.text}</strong>
                        </div>
                    `).reverse().join('');
                }
            } catch (e) {
                document.getElementById('list').innerHTML = "Error loading data.";
            }
        }

        loadData();
    </script>
</body>
</html>
```
### 5. Deploy the new application
Now is it time to deploy and test out the new apllication.
1. Make sure that all the files are saved.
2. Make sure you navigate to the map with the `serverless.yml` file. 
```bash
_$ cd serverless-project-tutorial
```
3. Run the `serverless deploy` command: 
```bash
_$ serverless deploy
```
4. Open up the URL given in the terminal and test out the new application.

> :question: **Question 5**: Is there something with the application that dosent seems to work as intended?

### 6. The development tool
To test this code we will use the serverless Frameworks dev functionality which is a powerful hybrid development tool that connects your local machine directly to your live AWS environment.It gives you the speed of local development combined with the reality of running your code in the cloud.

* Hybrid Execution: Your AWS Lambda functions are modified to proxy events from the cloud directly to your local machine.

* Real-time Debugging: The code actually runs on your computer instead of the cloud, allowing you to see changes instantly without waiting for a full deployment.

* Live Logs: All logs and errors from your code are streamed directly to your terminal, making it much easier to identify and fix bugs as they happen.

### 7. Setting up the enviroment
Before we can use the development mode, we need to ensure that our local environment has the necessary libraries to communicate with DynamoDB. We can ensure this by installing with the commands below: 

```bash
_$ npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```
### 8. Start the development mode
To start the develop environment simply run the command:
```bash
_$ serverless dev
```
### 9. Testing and debugging
1. **Open the Application**: Click the URL provided in the terminal to open your Serverless Storage interface in your browser. 
2. Test to interact with the application.

> :question: **Question 6**: Provide an screenshot of the error messages being printed in the terminal while interacting with the application.

### 10. Solve the Bug in Real-Time
The power of **Dev Mode** is that you can fix errors instantly. You don't need to restart the terminal or run a new deploy.Look at the error message being printed in the terminal and try to solve it.

> [!Hint] There is one variable named ErrorName in the handler.js file?...

Correct the error and save the file. Now interact with the application again and checks the logs. Dose everything look okay? In that case you can go ut from the **Dev Mode** using `Ctrl + C` or `Cmd + C`

### 11. Final deploy
Now when we are sure of that the code is working we want the deploy the working version to our product.Run the command: 

```bash
_$ serverless deploy
```
> :question: **Question 7**: What is the diffrence between serverless dev and serverless deploy commands? 

> :question: **Question 8**: Describe your experience using Dev Mode to fix the bug compared to the serverless deploy process you did earlier. How long did it take for the change to take effect, and how does this affect your workflow as a developer? 

# Task 1.5: Multi-Cloud Theoretical Comparison
While the Serverless Framework is compatible with multiple cloud providers—such as Google Cloud Platform (GCP) and Azure, it is important to understand that "provider-agnostic" does not mean your code will work everywhere without modification.

In this task, we will perform a theoretical comparison between AWS and GCP (Google Cloud). We have chosen not to perform a live deployment on Google Cloud due to the significant administrative overhead of setting up new accounts and billing. However, the most critical architectural insights can be gained by comparing the configuration and code side-by-side.

### 1. Analyzing the Comparison Files
Navigate to the folder `lab-code/google-cloud-version/`. Inside this folder, you will find the configuration and logic required to deploy the exact same functionality that you just built for AWS. Think of this as a "translation" of your current application into the Google Cloud ecosystem.
Open these files and compare them side-by-side with your working AWS files (serverless.yml and handler.js):
* **serverless-gcp.yml**: How the infrastructure (Provider, Functions, Events) is defined for Google.
* **handler-gcp.js**: How the application logic (Request handling, Database SDK) is written for Google.

> :question: **Question 9**: After comparing the two cloud services, can you identify any differences between their handler and configuration files? Describe at least one specific difference you observed in how they are defined.


### 2. Serverless Framework is an abstraction layer
The Serverless Framework acts as an abstraction layer. This means it provides a consistent interface (the CLI and the general YAML structure) regardless of which cloud provider you use.

* **What is unifined**: The framework make it possible to use the same commands (e.g `serverless deploy`) and same high-level concepts ( e.g `functions`, `events`,`resources`). This allows a team to use the same deployment pipeline and developer tools for both AWS and Google Cloud.

* **What is provider-dependent**: The framework cannot hide the fact that cloud provider are built differently. For example we can see that AWS Lambda expects an event object, while Google Cloud Functions expect req/res objects. Similarly, Amazon’s DynamoDB and Google’s Firestore have different APIs.

**Conclusion**: Even though the Serverless Framework provides a unified abstraction layer, it is not a "magic converter." While it standardizes the developer workflow (how you deploy), it cannot standardize the underlying architecture (how the cloud works).

As a developer, you still need to adapt your logic and configurations to the specific provider's DNA. Switching from AWS to Google Cloud will always require manual changes to the code and infrastructure because you are moving between two fundamentally different ecosystems.

>:question: **Question 10**: If you were to migrate 100 functions from AWS to Google Cloud, what part of the process would be the most time-consuming? (The deployment command or the code refactoring?)

# Task 1.6: Cleaning up Resources
Now when we have completed the lab we want to remove our application from the cloud to not waste credits. This can be done using the command:

1. Navigate so you stand in the same folder as your `serverless.yml` file you used to **deploy** your application to AWS.

2. Run the commando to remove the resources from the cloud:
```bash
_$ serverless remove
``` 
Running the serverless remove command will tell CloudFormation to delete everything it created: the Lambda functions, the API Gateway, the IAM roles, and the DynamoDB table. 

### 3. Verify the deltion:
1. Go back to the AWS Console.

2. Check CloudFormation -> The stack tutorial-project-dev should be gone (or in status DELETE_COMPLETE).

# Task 1.7: How to Submit this Assignment:

> :question: **Question 11**: How many hours did you spend on the lab?

> :question: **Question 12**: Which challanges did you run into during the lab and how did you overcome them?

Make sure that you have updated your local GitHub repository (using the git commands add, commit, and push) with all the files generated during this session.

Add all the web application files to your repository and comment what you think is relevant in your session's README.md.
