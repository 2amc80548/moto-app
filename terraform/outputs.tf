output "s3_bucket_name" {
  description = "Nombre del bucket S3 de origen"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_domain_name" {
  description = "El dominio de CloudFront (si está habilitado)"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.cdn[0].domain_name : "N/A (CloudFront deshabilitado)"
}

output "app_url" {
  description = "La URL pública para acceder a MotoCab en AWS"
  value       = var.enable_cloudfront ? "https://${aws_cloudfront_distribution.cdn[0].domain_name}" : "http://${aws_s3_bucket_website_configuration.frontend_web.website_endpoint}"
}
