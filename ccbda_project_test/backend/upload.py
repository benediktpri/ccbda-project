import json
import boto3
import os
from botocore.config import Config


region = os.environ.get('AWS_REGION', 'eu-west-1')
s3 = boto3.client('s3', region_name=region, endpoint_url=f'https://s3.{region}.amazonaws.com', config=Config(signature_version='s3v4'))

def lambda_handler(event, context):
    body = json.loads(event.get('body', '{}'))
    filename = body.get('filename')
    filetype = body.get('filetype', 'application/pdf')
    
    post_data = s3.generate_presigned_post(
        Bucket=os.environ['S3_BUCKET'],
        Key=filename,
        Fields={'Content-Type': filetype},
        Conditions=[{'Content-Type': filetype}],
        ExpiresIn=3600
    )
    
    return {
        'statusCode': 200, 
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'uploadPost': post_data})
    }