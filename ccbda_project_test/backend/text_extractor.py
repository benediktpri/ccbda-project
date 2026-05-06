import json
import boto3
import os

textract = boto3.client('textract')
sqs = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DYNAMO_TABLE'])
QUEUE_URL = os.environ['QUEUE_URL']

def lambda_handler(event, context):
    # Hämta filinfo från S3-triggern
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = event['Records'][0]['s3']['object']['key']
    
    print(f"Extraherar text från: {key}")
    
    # Runs textract to get pdf text 
    response = textract.detect_document_text(
        Document={'S3Object': {'Bucket': bucket, 'Name': key}}
    )
    
    extracted_text = ""
    for item in response.get("Blocks", []):
        if item["BlockType"] == "LINE":
            extracted_text += item["Text"] + "\n"
    
    # Saving status to DB. (Maybe not neccecary. We should ask the lab teacher)
    table.put_item(
        Item={
            'FileId': key,
            'RawText': extracted_text,
            'Status': 'PROCESSING_AI'
        }
    )
    
    # Send to SQS for futher processing by Bedrock
    sqs.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=json.dumps({
            'fileId': key,
            'text': extracted_text
        })
    )
    
    return {'statusCode': 200}