from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_region: str = "eu-west-1"
    dynamodb_table_name: str = "AppTable"
    dynamodb_endpoint_url: str | None = None
    s3_bucket_name: str = "ccbda-app-bucket"
    environment: str = "dev"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
