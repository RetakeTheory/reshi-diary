# 问卷文件上传配置

问卷文件题使用浏览器直传现有 S3 桶，文件内容不会写入 D1。生产环境需在 `reshi-diary-files` 桶配置以下 CORS 规则；否则浏览器会在上传时提示跨域设置错误。

```json
[
  {
    "AllowedOrigins": [
      "https://rettheory.top",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "content-type",
      "x-amz-meta-filename",
      "x-amz-meta-previewable"
    ],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

线上只保留正式域名即可。上传地址有效期为 15 分钟；服务端会在答卷提交时检查文件大小、问卷、题目、IP 与对象是否已完整上传。
