# frozen_string_literal: true

source "https://rubygems.org"

gem "jekyll-theme-chirpy", "~> 6.3", ">= 6.3.1"

# Essential Jekyll plugins for enhanced functionality
gem "jekyll-feed", "~> 0.12"
gem "jekyll-sitemap"
gem "jekyll-seo-tag"
gem "jekyll-archives"
gem "jekyll-paginate"
gem "jekyll-redirect-from"
gem "jekyll-compose"
gem "jekyll-include-cache"
gem "jemoji"

# Math and diagram support
gem "kramdown-math-katex"
gem "jekyll-katex"

# Enhanced features
gem "jekyll-optional-front-matter"
gem "jekyll-readme-index"
gem "jekyll-default-layout"
gem "jekyll-titles-from-headings"

group :jekyll_plugins do
  gem "jekyll-timeago", "~> 0.13"
end

group :test do
  gem "html-proofer", "~> 4.4"
end

# Windows and JRuby does not include zoneinfo files, so bundle the tzinfo-data gem
# and associated library.
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance-booster for watching directories on Windows
gem "wdm", "~> 0.1.1", :platforms => [:mingw, :x64_mingw, :mswin]

# Lock `http_parser.rb` gem to `v0.6.x` on JRuby builds since newer versions of the gem
# do not have a Java counterpart.
gem "http_parser.rb", "~> 0.6.0", :platforms => [:jruby]
