# Lab Session #X: Multi-Cloud Serverless Deployment
In this lab, you will explore the Serverless Framework to deploy serverless applications in an easy way. You will learn how to handle infrastructure as code (IaC), manage cloud permissions, and use development tools for real-time debugging.

## Objectives
- Deploy a serverless application to AWS and Azure
- Use serverless dev to debug cloud-to-code connectivity issues
- Understand the 

## Pre-lab homework
Setup a user for this task. Navigate to the AWS Console and create a new user with Programmatic Access. Attach the following managed policies:

- AmazonAPIGatewayAdministrator
- AmazonS3FullAccess
- AmazonDynamoDBFullAccess (Required for our database tasks)
- AWSCloudFormationFullAccess
- AWSLambda_FullAccess
- IAMFullAccess

Generate an Access Key and Secret Key for this user. Store them safely; you will not be able to see the Secret Key again.

Link your local machine to your AWS account and your new Access Key and Secret Key: 


```bash
_$ aws configure
```
.


## Background information

Serverless Framework: The Serverless Framework is a powerful, open-source command-line tool that allows you to build, deploy, and manage serverless applications across multiple cloud providers (like AWS, Azure, and Google Cloud)

## Lab Tasks Overview
- Task x.1: Install and set up Serverless Framework
- Task x.2: Initial Deployment to AWS
- Task x.3  Development and debugging using Serverless Frameworks dev function
- Task x.4  Deploy application to Google Cloud


## Task 1.1: Install and set up Serverless Framework

Install the framework globally using npm

```bash
_$ npm install -g serverless
```

## Create an account
Create an account at app.serverless.com.
In your terminal, run the login command:

```bash
_$ serverless login
```
Your browser will open automatically. Confirm the login to link your terminal to your Serverless account.

> [!Tip]
> Logging in to the Serverless Dashboard is not the same as configuring AWS. The dashboard manages your deployments and logs, while AWS credentials manage the physical resources.

## Link AWS Credentials to Serverless

Now that you are logged in to the Serverless Framework, you must ensure it can communicate with your AWS account. By default, the framework looks for the "default" profile you created earlier when running `aws configure`.

To verify that the Serverless Framework correctly sees your AWS identity and is ready to deploy, run:

```bash
_$ serverless doctor
```

## Task 2: Initial Deployment to AWS

In this task, we will perform our first deployment. Stand in the root of the project and run: 


```bash
_$ serverless
```
Then use the arrow keys to navigate and select

```bash
_$ AWS / Node.js / HTTP API
```
and press Enter.

When prompted for a name, type research-project-tutorial and press Enter.

If the CLI asks if you want to log in or register the project with the Serverless Dashboard, select Yes. 

After completing the setup, the Serverless Framework has automatically created a new directory named research-project-tutorial.Inside this folder, you will find two main files that form the core of your service:

1. serverless.yml: This is the "brain" of your project. It contains the configuration that tells AWS how to set up your infrastructure (Functions, APIs, Databases).

2. handler.js: This is where your code lives. It contains the logic that will be executed whenever your function is triggered.

## Deploying the Service

You must now enter the folder: 

```bash
cd research-project-tutorial
```

The files that were just generated contain a basic "Hello World" program that is already fully functional. Before we customize the code for our research project, we will deploy this boilerplate to AWS to ensure your cloud environment is correctly configured.

In your terminal, run the following command to package and upload your application to the cloud:

```bash
_$ serverless deploy
```

What is happening?
The Serverless Framework is now creating the necessary infrastructure on AWS (like Lambda functions and an API Gateway) to host your code in a production-like environment.

## Verify the Deployment:
Once the process finishes, look for the endpoint URL in your terminal output.

1. Copy the URL.
2. Paste it into your browser.
3. You should see a successful JSON message from your live AWS Lambda function!

Since you are logged in, the Serverless Framework automatically syncs your deployment with the cloud dashboard. This allows you to monitor your functions, view logs, and track metrics.

Go to app.serverless.com and log in.

You should now see your service research-project-tutorial listed in the overview.

Click on the service to explore the deployment history and the active endpoints.

:question: Question 1: Provide a screenshot of your Service Overview in the Serverless Framework Dashboard. Does the dashboard show the same endpoint URL as your terminal did?

## TASK3: Development and debugging using Serverless Framework
In this section we will update our application with some more functionality, first we will go through the main components of the yml file.

Replace the current content of your serverless.yml with the following code:

```yaml
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

The serverless.yml file is the blueprint of your entire cloud infrastructure. It is divided into three main sections that tell AWS what to build:

* provider: Defines where your service will live. Here, we specify AWS, the version of Node.js we are using (nodejs20.x), and the physical location of the servers (eu-west-1 / Ireland).

* functions: Defines what code should run.

* The events section creates an HTTP API that triggers the code whenever someone visits the /data path.

* resources: Defines extra tools your code needs.

> :question: **Question 2**: Look in the serverless.yml file and try to identify what type of AWS resource that is being defined by this configuration file?

## Update Lambda logic
Copy this Code into the handler.js, it contains the core logic of the applications Lambda function: 

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
## Create the Frontend User Interface
The final piece of the puzzle is the user interface. Create a new file in your project folder named index.html and paste the code below.

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

When this is done run its time to deploy our new application to the cloud with serverless deploy:

```bash
_$ serverless deploy
```

## The dev tool
To test this code we will use the serverless Frameworks dev functionality which is a powerful hybrid development tool that connects your local machine directly to your live AWS environment using the command: 

```bash
_$ serverless dev
```

It gives you the speed of local development combined with the reality of running your code in the cloud.

* Hybrid Execution: Your AWS Lambda functions are modified to proxy events from the cloud directly to your local machine.

* Real-time Debugging: The code actually runs on your computer instead of the cloud, allowing you to see changes instantly without waiting for a full deployment.

* Live Logs: All logs and errors from your code are streamed directly to your terminal, making it much easier to identify and fix bugs as they happen.

Before we can use the development mode, we need to ensure that our local environment has the necessary libraries to communicate with DynamoDB. We can do this by installing: 

```bash
_$ npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```
Make sure that you have saved the files: 
* index.html
* handler.js
* serverless.yml

Now run the serverless dev command to start the devlopment mode:

```bash
_$ serverless dev
```
Press the URL given in the terminal to interact with your application. 
Try to save something and as you might notice logs are now printing in your dev enviroment, read the error that accurs when you try to save something to the database.

> :question: **Question 3**: What seems to be the problem when you try to save something by pressing "Save" in the user interface?


As you might can tell from the logs there is an error with the name given to our table. This can be adjusted by changing line 45 to the following:

```javascript
    await docClient.send(new PutCommand({
                TableName: tableName,  // <-- Change ErrorName to this
                Item: item
            }));
```

Save the changes in the handler.js file and try to interact and save a new value with the interface. You should hopefully see that its works now!

## Final production deployment

While serverless dev is excellent for testing and fixing permissions in real-time, it is meant for development only. Once you have fixed the bug in the code and verified that the database connection works, you should perform a final deployment to ensure your stack is stable and fully synchronized.

1. Stop the dev mode by pressing Ctrl + C in your terminal.

2. Run the final deployment command:
```bash
_$ serverless deploy
```

>:question: Question 7: What is the main difference between serverless dev and serverless deploy? When would you use one over the other in a professional development environment?


## Cleaning Up Resources
When you are done with your AWS deployment, you should remove the resources to ensure you don't consume any more of your credits.

Running the serverless remove command will tell CloudFormation to delete everything it created: the Lambda functions, the API Gateway, the IAM roles, and the DynamoDB table

```bash
_$ serverless remove
```

### Verification

1. Go back to the AWS Console.

2. Check CloudFormation -> The stack tutorial-project-dev should be gone (or in status DELETE_COMPLETE).

3. Check DynamoDB -> Verify that the table has been removed.

>:question: Question 6: Why is it considered "Best Practice" to use serverless remove instead of manually deleting the Lambda function or the Database in the AWS Console? What happens to the "Stack" if you delete parts of it manually?

