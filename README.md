

https://d13lrhg0hjirwq.cloudfront.net

`yarn run build && aws s3 sync build s3://spotiwatcher`

# Invalidate on CloudFront: `aws cloudfront create-invalidation --distribution-id E38XTTQ7Y7WD12 --paths /index.html`