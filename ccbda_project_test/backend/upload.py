import json
import boto3
import os
import uuid
from botocore.config import Config


region = os.environ.get('AWS_REGION', 'eu-west-1')
s3 = boto3.client('s3', region_name=region, endpoint_url=f'https://s3.{region}.amazonaws.com', config=Config(signature_version='s3v4'))

def lambda_handler(event, context):
    body = json.loads(event.get('body', '{}'))
    filename = body.get('filename')
    filetype = body.get('filetype', 'application/pdf')

    # Generate a unique key so two users uploading the same filename don't collide
    file_id = f"{uuid.uuid4()}_{filename}"
    
    post_data = s3.generate_presigned_post(
        Bucket=os.environ['S3_BUCKET'],
        Key=file_id,
        Fields={'Content-Type': filetype},
        Conditions=[{'Content-Type': filetype}],
        ExpiresIn=3600
    )
    
    return {
        'statusCode': 200, 
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'uploadPost': post_data, 'fileId': file_id})
    }