import {parseComment} from '../../src/functions/parse-comment'

test('checks the parsed comment is return', async () => {
  const cases = [
    {
      body: '.deploy to development custom params',
      return: 'custom params',
    },
    {
      body: '.deploy development custom params',
      return: 'custom params',
    },
    {
      body: '.deploy noop to development custom params',
      return: 'custom params',
    },
    {
      body: '.deploy noop development custom params',
      return: 'custom params',
    },
    {
      body: '.deploy main',
      return: '',
    },
    {
      body: '.deploy',
      return: '',
    },
    {
      body: '',
      return: '',
    },
    {
      body: 'non-deploy comment',
      return: '',
    },
  ];
  cases.forEach(async e => {
    expect(
      await parseComment(e.body, '.deploy', 'noop', 'main')
    ).toStrictEqual(e.return)
  })
})
