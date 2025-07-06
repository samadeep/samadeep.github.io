module Jekyll
  # Removes common emoji Unicode characters from content before render
  module RemoveEmojis
    # Rough Unicode ranges covering most emoji symbols (Misc Symbols, pictographs, etc.)
    EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.freeze

    Jekyll::Hooks.register %i[pages posts], :pre_render do |doc|
      next unless doc.output_ext == ".html" && doc.content

      doc.content = doc.content.gsub(EMOJI_REGEX, '')
    end
  end
end 