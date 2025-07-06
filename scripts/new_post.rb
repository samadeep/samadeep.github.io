#!/usr/bin/env ruby

require 'fileutils'
require 'date'
require 'optparse'

class BlogPostGenerator
  def initialize
    @options = {
      title: nil,
      categories: [],
      tags: [],
      author: 'Samadeep Sengupta',
      template: 'default'
    }
  end

  def run
    parse_options
    
    if @options[:title].nil?
      puts "Error: Title is required"
      puts "Usage: ruby scripts/new_post.rb --title 'My New Post'"
      exit 1
    end

    create_post
  end

  private

  def parse_options
    OptionParser.new do |opts|
      opts.banner = "Usage: ruby scripts/new_post.rb [options]"

      opts.on("-t", "--title TITLE", "Post title (required)") do |title|
        @options[:title] = title
      end

      opts.on("-c", "--categories CATEGORIES", "Categories (comma-separated)") do |categories|
        @options[:categories] = categories.split(',').map(&:strip)
      end

      opts.on("-g", "--tags TAGS", "Tags (comma-separated)") do |tags|
        @options[:tags] = tags.split(',').map(&:strip)
      end

      opts.on("-a", "--author AUTHOR", "Author name") do |author|
        @options[:author] = author
      end

      opts.on("-T", "--template TEMPLATE", "Template (default, technical, tutorial, review)") do |template|
        @options[:template] = template
      end

      opts.on("-h", "--help", "Show this help message") do
        puts opts
        exit
      end
    end.parse!
  end

  def create_post
    date = Date.today
    filename = "#{date.strftime('%Y-%m-%d')}-#{slugify(@options[:title])}.md"
    filepath = File.join("_posts", filename)

    if File.exist?(filepath)
      puts "Error: Post already exists at #{filepath}"
      exit 1
    end

    content = generate_content(date)
    
    File.write(filepath, content)
    puts "Created new post: #{filepath}"
    puts "Title: #{@options[:title]}"
    puts "Categories: #{@options[:categories].join(', ')}" unless @options[:categories].empty?
    puts "Tags: #{@options[:tags].join(', ')}" unless @options[:tags].empty?
    
    # Open in default editor if available
    if ENV['EDITOR']
      system("#{ENV['EDITOR']} #{filepath}")
    end
  end

  def generate_content(date)
    template = load_template(@options[:template])
    
    template.gsub!('{{TITLE}}', @options[:title])
    template.gsub!('{{DATE}}', date.strftime('%Y-%m-%d %H:%M:%S +0000'))
    template.gsub!('{{AUTHOR}}', @options[:author])
    template.gsub!('{{CATEGORIES}}', format_yaml_array(@options[:categories]))
    template.gsub!('{{TAGS}}', format_yaml_array(@options[:tags]))
    template.gsub!('{{SLUG}}', slugify(@options[:title]))
    template.gsub!('{{DESCRIPTION}}', generate_description)
    
    template
  end

  def load_template(template_name)
    template_path = File.join("_templates", "#{template_name}.md")
    
    if File.exist?(template_path)
      File.read(template_path)
    else
      default_template
    end
  end

  def default_template
    <<~TEMPLATE
      ---
      layout: post
      title: "{{TITLE}}"
      date: {{DATE}}
      categories: {{CATEGORIES}}
      tags: {{TAGS}}
      author: {{AUTHOR}}
      description: "{{DESCRIPTION}}"
      ---

      # {{TITLE}}

      ## Introduction

      Write your introduction here.

      ## Main Content

      ### Section 1

      Add your content here.

      ### Section 2

      Add more content here.

      ## Conclusion

      Summarize your post here.

      ---

      *Have questions or feedback? Feel free to reach out on [Twitter](https://twitter.com/samadeepviews) or [LinkedIn](https://www.linkedin.com/in/samadeep)!*
    TEMPLATE
  end

  def format_yaml_array(array)
    return "[]" if array.empty?
    "[#{array.map { |item| "\"#{item}\"" }.join(', ')}]"
  end

  def slugify(title)
    title.downcase
         .gsub(/[^a-z0-9\s-]/, '')
         .gsub(/\s+/, '-')
         .gsub(/-+/, '-')
         .gsub(/^-|-$/, '')
  end

  def generate_description
    "A comprehensive guide to #{@options[:title].downcase}. Learn about best practices, implementation details, and real-world examples."
  end
end

if __FILE__ == $0
  generator = BlogPostGenerator.new
  generator.run
end 