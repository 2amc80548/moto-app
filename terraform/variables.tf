variable "aws_region" {
  description = "Región de AWS donde se desplegarán los recursos."
  type        = string
  default     = "us-east-1"
}

variable "access_key" {
  description = "Access Key ID de AWS"
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "Secret Access Key de AWS"
  type        = string
  sensitive   = true
}

variable "bucket_name" {
  description = "Nombre del bucket S3. Debe ser GLOBALMENTE único."
  type        = string
  default     = "motocab-web-app-hosting"
}

variable "enable_cloudfront" {
  description = "Si es true, crea la distribución de CloudFront (HTTPS). Si es false, sirve el sitio por S3 directamente (HTTP)."
  type        = bool
  default     = false
}
