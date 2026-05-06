import json
import boto3
import os

region = os.environ.get('AWS_REGION', 'eu-west-1')
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(os.environ['DYNAMO_TABLE'])

def lambda_handler(event, context):
    file_id = event.get('queryStringParameters', {}).get('id')
    res = table.get_item(Key={'FileId': file_id})
    
    return {
        'statusCode': 200, 
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(res.get('Item', {'Status': 'PENDING'}))
    }