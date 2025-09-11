# Use a minimal nginx image
FROM nginx:alpine

# Copy all site files into nginx html directory
COPY . /usr/share/nginx/html

# Optional: if you have a custom nginx config (for SPA routing etc.), copy it over
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Start nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
