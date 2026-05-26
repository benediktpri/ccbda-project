from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_region: str = "eu-west-1"
    dynamodb_table_name: str = "AppTable"
    dynamodb_endpoint_url: str | None = None
    s3_bucket_name: str = "ccbda-app-bucket"
    job_processing_queue_url: str | None = None
    bedrock_model_id: str = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
    cognito_user_pool_id: str | None = None
    cognito_app_client_id: str | None = None
    environment: str = "dev"
    auth_bypass: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
