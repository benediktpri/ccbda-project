import json
import boto3
import os

bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DYNAMO_TABLE'])

def lambda_handler(event, context):
    for record in event['Records']:
        body = json.loads(record['body'])
        file_id = body['fileId']
        text = body['text']
        
        prompt = f"Analysera detta CV och returnera JSON med summary (Return ONLY valid JSON. No explanations, no markdown), top_skills och improvement_tip:\n\n{text}"
        
        # Bedrock-konfiguration (Claude v3 exempel)
        body_payload = json.dumps({
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 1000,
            "temperature": 0.2
        })

        try:
            response = bedrock.invoke_model(
                modelId="google.gemma-3-4b-it",
                body=body_payload,
                contentType="application/json",
                accept="application/json"
            )
            
            result = json.loads(response["body"].read())

            ai_content = result["choices"][0]["message"]["content"]
            
            # Here we update DynamoDB to Completed
            table.update_item(
                Key={'FileId': file_id},
                UpdateExpression="SET ai_analysis = :val, #s = :status",
                ExpressionAttributeValues={
                    ':val': ai_content,
                    ':status': 'COMPLETED'
                },
                ExpressionAttributeNames={"#s": "Status"}
            )
            
        except Exception as e:
            print(f"FEL vid Bedrock-anrop för {file_id}: {str(e)}")
            # Since we don't want to waste tokens, we don't want SQS to keep trying
            # when we have a logic error.
            # Instead we mark it as failed in DB.
            
            table.update_item(
                Key={'FileId': file_id},
                UpdateExpression="SET #s = :status, error_msg = :msg",
                ExpressionAttributeValues={
                    ':status': 'FAILED_AI',
                    ':msg': str(e)
                },
                ExpressionAttributeNames={"#s": "Status"}
            )

            # Return 200 to SQS so the message is deleted from the queue
            return {'statusCode': 200}

    return {'statusCode': 200}